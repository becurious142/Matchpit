import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchParticipantsTable,
  bookingsTable,
  profilesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { processReferralRewards, processFirstBookingCashback, processFirstMatchCashback } from "../lib/wallet";
import { generateBookingPayout, generateMatchPayout } from "../lib/payouts";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── POST /payments/webhook — Razorpay webhook ────────────────────────────────
router.post("/payments/webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers["x-razorpay-signature"] as string;
      const body = JSON.stringify(req.body);
      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");
      if (signature !== expected) {
        res.status(400).json({ error: "invalid_signature" });
        return;
      }
    }

    const { event, payload: rzpPayload } = req.body;
    const razorpayPaymentId = rzpPayload?.payment?.entity?.id;
    const razorpayOrderId = rzpPayload?.payment?.entity?.order_id;

    if (!razorpayOrderId) {
      res.json({ ok: true });
      return;
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
      .limit(1);

    if (!payment) {
      res.json({ ok: true });
      return;
    }

    // Idempotency — already completed, skip
    if (payment.status === "completed") {
      res.json({ ok: true, idempotent: true });
      return;
    }

    if (event === "payment.captured" || event === "order.paid") {
      await db
        .update(paymentsTable)
        .set({
          status: "completed",
          razorpayPaymentId: razorpayPaymentId ?? null,
        })
        .where(eq(paymentsTable.id, payment.id));

      setImmediate(async () => {
        try {
          if (payment.type === "booking") {
            await generateBookingPayout(payment.referenceId!, payment.amount);
            await processFirstBookingCashback(payment.userId);
            await processReferralRewards(payment.userId, payment.type);
          } else if (payment.type === "host_commitment") {
            await generateMatchPayout(payment.referenceId!, payment.amount);
            await processFirstMatchCashback(payment.userId);
            await processReferralRewards(payment.userId, payment.type);
          } else if (payment.type === "match_reserve") {
            // Participant already reserved
          } else if (payment.type === "match_final") {
            if (payment.referenceId) {
              const [participant] = await db
                .select()
                .from(hostedMatchParticipantsTable)
                .where(
                  and(
                    eq(hostedMatchParticipantsTable.matchId, payment.referenceId),
                    eq(hostedMatchParticipantsTable.userId, payment.userId)
                  )
                )
                .limit(1);
              if (participant && participant.status !== "final_paid") {
                await db
                  .update(hostedMatchParticipantsTable)
                  .set({ status: "final_paid" })
                  .where(eq(hostedMatchParticipantsTable.id, participant.id));
                await generateMatchPayout(payment.referenceId, payment.amount);
              }
            }
          }
        } catch (err) {
          logger.error({ err, paymentId: payment.id }, "Webhook post-payment processing error");
        }
      });
    } else if (event === "payment.failed") {
      await db
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.id, payment.id));
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
    const stale = await db
      .select({
        payment: paymentsTable,
        userName: profilesTable.fullName,
        userEmail: profilesTable.email,
      })
      .from(paymentsTable)
      .leftJoin(profilesTable, eq(paymentsTable.userId, profilesTable.id))
      .where(
        and(
          eq(paymentsTable.status, "pending")
        )
      )
      .orderBy(paymentsTable.createdAt);

    const stalePayments = stale.filter(
      (p) => p.payment.createdAt < staleCutoff
    );

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
        createdAt: payment.createdAt.toISOString(),
        ageMinutes: Math.round(
          (Date.now() - payment.createdAt.getTime()) / 60000
        ),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching pending payments");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
