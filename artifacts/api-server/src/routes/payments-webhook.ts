import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  paymentWebhookEventsTable,
  hostedMatchReservationsTable,
  profilesTable,
  bookingsTable,
  reconciliationReportsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "../lib/razorpay";
import { logger } from "../lib/logger";
import { runPostPaymentSideEffects, convertReservationToParticipant } from "../lib/post-payment";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// ─── POST /payments/webhook — Razorpay webhook ────────────────────────────────
// HM9 FORENSIC PATCH — Webhook Authority
//
// This is the CANONICAL source of truth for payment state.
// Contract:
//  1. Persist raw event BEFORE processing (audit)
//  2. Early-return on duplicate providerEventId (idempotency)
//  3. Lock payment row with SELECT FOR UPDATE (concurrency safety)
//  4. Lock reservation row with SELECT FOR UPDATE (concurrency safety)
//  5. Late webhook on expired reservation → refund_required (safety)
//  6. Run side effects OUTSIDE the main transaction (avoid long-running tx)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payments/webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn("Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured");
      res.status(500).json({ error: "missing_secret" });
      return;
    }

    const signature = req.headers["x-razorpay-signature"] as string;
    // req.body is a raw Buffer when express.raw() is used (production).
    const rawBody: string = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      logger.warn("Webhook signature validation failed");
      res.status(400).json({ error: "invalid_signature" });
      return;
    }
    
    // Signature verified successfully - proceed with processing

    const payload = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
    const eventType: string = payload.event;

    // Only process these event types
    const relevantEvents = ["order.paid", "payment.captured", "payment.failed"];
    if (!relevantEvents.includes(eventType)) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    // Extract IDs from payload
    const rzpPaymentId: string | undefined = payload.payload?.payment?.entity?.id;
    const rzpOrderId: string =
      eventType === "order.paid"
        ? payload.payload.order.entity.id
        : payload.payload.payment.entity.order_id;

    // Stable event identifier: Razorpay may not provide an event ID header on all plans.
    // We use orderId+eventType as a stable idempotency key.
    const providerEventId = `${rzpOrderId}::${eventType}`;

    // ── State to carry out of the transaction ────────────────────────────────
    let shouldRunSideEffects = false;
    let sideEffectCtx: {
      paymentId: string;
      userId: string;
      type: string;
      referenceId: string | null;
      amount: number;
      grossAmount: number;
      reservationId?: string;
    } | null = null;

    await db.transaction(async (tx) => {
      // ── Step 1: Idempotency — persist event, detect duplicate ──────────────
      const [existingEvent] = await tx
        .select()
        .from(paymentWebhookEventsTable)
        .where(eq(paymentWebhookEventsTable.providerEventId, providerEventId))
        .for("update")
        .limit(1);

      if (existingEvent) {
        if (existingEvent.processingStatus === "processed") {
          logger.info({ providerEventId }, "Webhook already processed — idempotent skip");
          return; // exits transaction only
        }
        // Retry — increment counter
        await tx
          .update(paymentWebhookEventsTable)
          .set({ retryCount: existingEvent.retryCount + 1 })
          .where(eq(paymentWebhookEventsTable.id, existingEvent.id));
      } else {
        // Persist raw event BEFORE processing
        await tx.insert(paymentWebhookEventsTable).values({
          providerEventId,
          provider: "razorpay",
          eventType,
          payload,
          processingStatus: "pending",
        });
      }

      if (!rzpOrderId) throw new Error("Could not extract orderId from payload");

      // ── Step 2: Lock payment row ───────────────────────────────────────────
      const [payment] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.razorpayOrderId, rzpOrderId))
        .for("update")
        .limit(1);

      if (!payment) {
        // Unknown order — mark event as ignored, not failed
        await tx
          .update(paymentWebhookEventsTable)
          .set({ processingStatus: "ignored", processedAt: new Date() })
          .where(eq(paymentWebhookEventsTable.providerEventId, providerEventId));
        return;
      }

      // ── Step 3: Compute new payment status ────────────────────────────────
      const isAlreadyTerminal = ["verified", "success", "payment_captured"].includes(payment.status);

      if (eventType === "payment.failed") {
        await tx
          .update(paymentsTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(paymentsTable.id, payment.id));
      } else if (!isAlreadyTerminal) {
        const newStatus =
          eventType === "order.paid" ? "verified" : "payment_captured";
        await tx
          .update(paymentsTable)
          .set({
            status: newStatus,
            razorpayPaymentId: rzpPaymentId ?? payment.razorpayPaymentId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id));
      }

      // ── Step 4: Reservation handling (match payment types) ────────────────
      const isMatchPayment = ["host_commitment", "match_reserve", "match_final"].includes(payment.type);
      let reservationId: string | undefined;

      if (isMatchPayment && eventType !== "payment.failed") {
        const [reservation] = await tx
          .select()
          .from(hostedMatchReservationsTable)
          .where(eq(hostedMatchReservationsTable.paymentOrderId, rzpOrderId))
          .for("update") // HM9: explicit row lock
          .limit(1);

        if (reservation) {
          reservationId = reservation.id;

          if (!reservation.isActive) {
            // HM10 PATCH 4: Late Webhook Rejection
            // A payment was captured but the reservation is in a terminal state (expired/cancelled).
            // We transition the payment to refund_required and persist a reconciliation report.
            await tx
              .update(paymentsTable)
              .set({ reviewStatus: "refund_required", updatedAt: new Date() })
              .where(eq(paymentsTable.id, payment.id));

            // Generate reconciliation report for finance ops
            await tx.insert(reconciliationReportsTable).values({
              reportType: "late_webhook_refund_required",
              severity: "high",
              entityType: "payment",
              entityId: payment.id,
              sourceSystem: "webhook",
              payload: {
                paymentId: payment.id,
                reservationId: reservation.id,
                orderId: rzpOrderId,
                reservationStatus: reservation.reservationStatus
              }
            });

            logger.warn(
              { paymentId: payment.id, reservationId: reservation.id, orderId: rzpOrderId },
              "HM10: Late webhook on inactive reservation — marked refund_required & logged for reconciliation"
            );
            
            // Persist the webhook state machine progression
            await tx
              .update(paymentWebhookEventsTable)
              .set({ processingStatus: "refund_required", processedAt: new Date() })
              .where(eq(paymentWebhookEventsTable.providerEventId, providerEventId));
            return;
          } else if (reservation.reservationStatus === "pending_payment" || reservation.reservationStatus === "payment_captured") {
            await tx
              .update(hostedMatchReservationsTable)
              .set({ reservationStatus: "awaiting_conversion", paymentId: payment.id, updatedAt: new Date() })
              .where(eq(hostedMatchReservationsTable.id, reservation.id));
          }
        }
      }

      // ── Step 5: Mark event processed ─────────────────────────────────────
      await tx
        .update(paymentWebhookEventsTable)
        .set({ processingStatus: "processed", processedAt: new Date() })
        .where(eq(paymentWebhookEventsTable.providerEventId, providerEventId));

      // ── Set up side-effect context to run OUTSIDE the transaction ─────────
      if (eventType !== "payment.failed") {
        shouldRunSideEffects = true;
        sideEffectCtx = {
          paymentId: payment.id,
          userId: payment.userId,
          type: payment.type,
          referenceId: payment.referenceId,
          amount: Number(payment.amount),
          grossAmount: Number(payment.grossAmount || payment.amount),
          reservationId,
        };
      }
    });

    // ── Step 6: Side effects OUTSIDE the transaction ───────────────────────
    // Reservation → Participant conversion and payout generation happen here
    // to avoid holding the DB transaction open during slow operations.
    if (shouldRunSideEffects && sideEffectCtx) {
      const ctx = sideEffectCtx;
      if (ctx.reservationId) {
        try {
          const result = await convertReservationToParticipant(
            ctx.reservationId,
            ctx.paymentId
          );
          logger.info({ ...result, reservationId: ctx.reservationId }, "HM9: reservation conversion");
        } catch (err) {
          logger.error({ err, reservationId: ctx.reservationId }, "HM9: reservation conversion failed");
        }
      }

      try {
        await runPostPaymentSideEffects(ctx);
      } catch (err) {
        logger.error({ err, paymentId: ctx.paymentId }, "HM9: post-payment side effects failed");
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Webhook processing error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /admin/payments/reconcile-pending ────────────────────────────────────
router.get("/admin/payments/reconcile-pending", requireAdmin, async (req, res) => {
  try {
    const staleCutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min
    const all = await db
      .select({
        payment: paymentsTable,
        userName: profilesTable.fullName,
        userEmail: profilesTable.email,
      })
      .from(paymentsTable)
      .leftJoin(profilesTable, eq(paymentsTable.userId, profilesTable.id))
      .where(eq(paymentsTable.status, "pending"))
      .orderBy(paymentsTable.createdAt);

    const stalePayments = all.filter((p) => p.payment.createdAt < staleCutoff);

    res.json(
      stalePayments.map(({ payment, userName, userEmail }) => ({
        id: payment.id,
        userId: payment.userId,
        userName: userName ?? "Unknown",
        userEmail: userEmail ?? "Unknown",
        type: payment.type,
        amount: payment.amount,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        referenceId: payment.referenceId,
        reviewStatus: payment.reviewStatus,
        createdAt: payment.createdAt.toISOString(),
        ageMinutes: Math.round((Date.now() - payment.createdAt.getTime()) / 60000),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching pending payments");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
