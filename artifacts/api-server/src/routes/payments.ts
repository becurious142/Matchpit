import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchParticipantsTable,
  bookingsTable,
  hostedMatchesTable,
  hostedMatchReservationsTable,
  profilesTable,
  venuesTable,
  slotsTable,
  walletLedgerTable,
} from "@workspace/db";
import { eq, desc, and, ne, inArray, sql } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";
import { runPostPaymentSideEffects, convertReservationToParticipant, MATCH_RESERVATION_TIMEOUT_MINUTES, maybeMarkParticipantPaid } from "../lib/post-payment";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Shared helpers ────────────────────────────────────────────────────────────

function computeVenueSlotPrice(
  venue: typeof venuesTable.$inferSelect,
  slot: typeof slotsTable.$inferSelect,
): number {
  if (slot.priceOverride != null) return Number(slot.priceOverride);
  const date = new Date(slot.date);
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) return venue.weekendPrice;
  const hour = parseInt(slot.startTime.split(":")[0]!, 10);
  if (hour < 10) return venue.weekdayMorningPrice;
  if (hour < 17) return venue.weekdayDayPrice;
  return venue.weekdayEveningPrice;
}

function computeHostedMatchAmounts(
  match: { totalPlayers: number },
  venue: typeof venuesTable.$inferSelect,
  slot: typeof slotsTable.$inferSelect,
) {
  const totalVenueCost = computeVenueSlotPrice(venue, slot);
  const reserveFeePerPlayer = Math.ceil(totalVenueCost / match.totalPlayers / 2);
  const finalFeePerPlayer = Math.ceil(totalVenueCost / match.totalPlayers) - reserveFeePerPlayer;
  const hostFee = 49;
  const hostCommitmentGross = reserveFeePerPlayer + hostFee;

  return {
    totalVenueCost,
    reserveFeePerPlayer,
    finalFeePerPlayer,
    hostFee,
    hostCommitmentGross,
  };
}

function validateConsecutiveSlots(slots: typeof slotsTable.$inferSelect[]): boolean {
  if (slots.length === 0) return false;
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.date !== sorted[i + 1]!.date) return false;
    if (sorted[i]!.endTime !== sorted[i + 1]!.startTime) return false;
  }
  return true;
}

// ─── POST /payments/create-order ─────────────────────────────────────────────
// For type="booking": server fetches + prices all slotIds independently.
// For other types: amount from client is used (existing behavior preserved).
router.post("/payments/create-order", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { type, referenceId, amount: rawAmount, walletAmountUsed: clientWalletHint = 0, venueId, slotIds } = req.body;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // ── Re-read wallet balance — never trust client value ──
    const [freshProfile] = await db
      .select({ walletBalance: profilesTable.walletBalance, walletAutoUse: profilesTable.walletAutoUse })
      .from(profilesTable)
      .where(eq(profilesTable.id, profile.id))
      .limit(1);
    const actualBalance = Number(freshProfile?.walletBalance ?? 0);

    let totalAmount = 0;
    let computedComponents = { hostFeeComponent: 0, reserveFeeComponent: 0, finalFeeComponent: 0 };

    // ── host_match_create: pre-payment order before match exists ──────────────
    // The frontend sends this type when the host hasn't created a match yet.
    // We compute the amount from venueId + slotId + totalPlayers, create a
    // Razorpay order, and store match metadata in the payment row.
    // After payment, POST /hosted-matches creates the match atomically.
    if (type === "host_match_create") {
      const { slotId, totalPlayers: rawTotalPlayers } = req.body;
      const tPlayers = Number(rawTotalPlayers) || 10;

      if (!venueId || !slotId) {
        res.status(400).json({ error: "validation", message: "venueId and slotId are required for host_match_create" });
        return;
      }

      const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
      if (!venue) {
        res.status(404).json({ error: "not_found", message: "Venue not found" });
        return;
      }

      const [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
      if (!slot) {
        res.status(404).json({ error: "not_found", message: "Slot not found" });
        return;
      }

      if (slot.status !== "available") {
        res.status(409).json({ error: "slot_unavailable", message: "This slot is no longer available" });
        return;
      }

      const amounts = computeHostedMatchAmounts({ totalPlayers: tPlayers }, venue, slot);
      totalAmount = amounts.hostCommitmentGross;
      computedComponents = {
        hostFeeComponent: amounts.hostFee,
        reserveFeeComponent: amounts.reserveFeePerPlayer,
        finalFeeComponent: 0,
      };

      // Persist metadata for post-payment match creation
      const matchMetadata = JSON.stringify({
        venueId,
        slotId,
        sport: req.body.sport ?? "",
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        totalPlayers: tPlayers,
        minPlayers: req.body.minPlayers ?? Math.max(2, Math.ceil(tPlayers * 0.6)),
        skillLevel: req.body.skillLevel ?? "any",
        notes: req.body.notes ?? null,
        totalVenueCost: amounts.totalVenueCost,
        reserveFeePerPlayer: amounts.reserveFeePerPlayer,
        finalFeePerPlayer: amounts.finalFeePerPlayer,
        hostFee: amounts.hostFee,
      });

      const razorpayAmount = Math.max(0, totalAmount);

      if (!razorpay) {
        // Dev mode
        const [devPayment] = await db.insert(paymentsTable).values({
          userId: profile.id,
          type: "host_commitment",
          referenceId: null,
          razorpayOrderId: `order_dev_host_${Date.now()}`,
          amount: totalAmount.toString(),
          grossAmount: totalAmount,
          paymentCategory: "host_commitment",
          hostFeeComponent: amounts.hostFee,
          reserveFeeComponent: amounts.reserveFeePerPlayer,
          finalFeeComponent: 0,
          walletComponent: 0,
          refundComponent: 0,
          status: "payment_initiated",
          metadata: matchMetadata,
        }).returning();

        res.status(201).json({
          orderId: devPayment.razorpayOrderId,
          amount: Math.round(razorpayAmount * 100),
          currency: "INR",
          razorpayKeyId: "rzp_test_placeholder",
          prefillName: profile.fullName,
          prefillEmail: profile.email,
          prefillContact: profile.phone ?? null,
          computedGrossAmount: totalAmount,
          ...computedComponents,
        });
        return;
      }

      const order = await razorpay.orders.create({
        amount: Math.round(razorpayAmount * 100),
        currency: "INR",
        notes: { type: "host_commitment", userId: profile.id },
      });

      await db.insert(paymentsTable).values({
        userId: profile.id,
        type: "host_commitment",
        referenceId: null,
        razorpayOrderId: order.id,
        amount: totalAmount.toString(),
        grossAmount: totalAmount,
        paymentCategory: "host_commitment",
        hostFeeComponent: amounts.hostFee,
        reserveFeeComponent: amounts.reserveFeePerPlayer,
        finalFeeComponent: 0,
        walletComponent: 0,
        refundComponent: 0,
        status: "payment_initiated",
        metadata: matchMetadata,
      });

      res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKeyId: getRazorpayKeyId(),
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
        computedGrossAmount: totalAmount,
        ...computedComponents,
      });
      return;
    }

    if (type === "booking") {
      // ── Server-side pricing for booking orders ─────────────────────────────
      if (!venueId || !Array.isArray(slotIds) || slotIds.length === 0) {
        res.status(400).json({ error: "validation", message: "venueId and slotIds[] are required for booking orders" });
        return;
      }

      const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
      if (!venue) {
        res.status(404).json({ error: "not_found", message: "Venue not found" });
        return;
      }

      const slots = await db.select().from(slotsTable).where(inArray(slotsTable.id, slotIds as string[]));

      if (slots.length !== (slotIds as string[]).length) {
        res.status(404).json({ error: "not_found", message: "One or more slots not found" });
        return;
      }

      // All slots must belong to this venue
      if (slots.some((s) => s.venueId !== venueId)) {
        res.status(400).json({ error: "validation", message: "All slots must belong to the specified venue" });
        return;
      }

      // All slots must be available and not owner-blocked
      const blockedOrUnavailable = slots.filter((s) => s.isBlockedByOwner || s.status !== "available");
      if (blockedOrUnavailable.length > 0) {
        res.status(409).json({ error: "slot_unavailable", message: "One or more slots are not available" });
        return;
      }

      // Slots must be consecutive
      if (!validateConsecutiveSlots(slots)) {
        res.status(400).json({ error: "validation", message: "Slots must be consecutive and on the same day" });
        return;
      }

      // Server-computed total
      totalAmount = slots.reduce((sum, s) => sum + computeVenueSlotPrice(venue, s), 0);
    } else if (type === "host_commitment" || type === "match_reserve" || type === "match_final") {
      let matchContext: { totalPlayers: number } | undefined;
      let venue: typeof venuesTable.$inferSelect | undefined;
      let slot: typeof slotsTable.$inferSelect | undefined;

      // Only query hosted_matches if referenceId looks like a real UUID
      if (referenceId && UUID_RE.test(referenceId)) {
        const [matchRow] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, referenceId)).limit(1);
        if (matchRow) {
          matchContext = { totalPlayers: matchRow.totalPlayers };
          [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, matchRow.venueId)).limit(1);
          [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, matchRow.slotId)).limit(1);
        }
      }
      
      if (!matchContext && type === "host_commitment") {
        const vId = venueId || req.body.venueId;
        const sId = (slotIds && slotIds[0]) || req.body.slotId || referenceId;
        const tPlayers = Number(req.body.totalPlayers) || 10;
        if (vId && sId) {
          matchContext = { totalPlayers: tPlayers };
          [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, vId)).limit(1);
          [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, sId)).limit(1);
        }
      }

      if (!matchContext || !venue || !slot) {
        res.status(404).json({ error: "not_found", message: "Required match/venue/slot context not found" });
        return;
      }

      const amounts = computeHostedMatchAmounts(matchContext, venue, slot);

      if (type === "host_commitment") {
        totalAmount = amounts.hostCommitmentGross;
        computedComponents = { hostFeeComponent: amounts.hostFee, reserveFeeComponent: amounts.reserveFeePerPlayer, finalFeeComponent: 0 };
      } else if (type === "match_reserve") {
        totalAmount = amounts.reserveFeePerPlayer;
        computedComponents = { hostFeeComponent: 0, reserveFeeComponent: amounts.reserveFeePerPlayer, finalFeeComponent: 0 };
      } else if (type === "match_final") {
        totalAmount = amounts.finalFeePerPlayer;
        computedComponents = { hostFeeComponent: 0, reserveFeeComponent: 0, finalFeeComponent: amounts.finalFeePerPlayer };
      }

      if (!totalAmount || totalAmount <= 0) {
        res.status(400).json({ error: "validation", message: "computed amount must be a positive number" });
        return;
      }
    } else {
      // ── Non-booking types: use client-supplied amount (existing behavior) ──
      totalAmount = Number(rawAmount);
      if (!totalAmount || totalAmount <= 0) {
        res.status(400).json({ error: "validation", message: "amount must be a positive number" });
        return;
      }
    }

    // Clamp wallet use
    const serverApprovedWalletUse = Math.min(Number(clientWalletHint), actualBalance, totalAmount);
    const razorpayAmount = Math.max(0, totalAmount - serverApprovedWalletUse);

    if (!razorpay) {
      res.status(201).json({
        orderId: `order_dev_${Date.now()}`,
        amount: Math.round(razorpayAmount * 100),
        currency: "INR",
        razorpayKeyId: "rzp_test_placeholder",
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
        walletAmountUsed: serverApprovedWalletUse,
        fullWallet: razorpayAmount === 0,
        computedGrossAmount: totalAmount,
        ...computedComponents,
      });
      return;
    }

    if (razorpayAmount === 0) {
      const [payment] = await db.insert(paymentsTable).values({
        userId: profile.id,
        type,
        referenceId: referenceId ?? null,
        razorpayOrderId: `wallet_${Date.now()}`,
        amount: totalAmount.toString(),
        grossAmount: totalAmount,
        paymentCategory: type === "host_commitment" || type === "match_reserve" || type === "match_final" ? type : "booking",
        hostFeeComponent: computedComponents.hostFeeComponent,
        reserveFeeComponent: computedComponents.reserveFeeComponent,
        finalFeeComponent: computedComponents.finalFeeComponent,
        walletComponent: serverApprovedWalletUse,
        refundComponent: 0,
        status: "pending",
      }).returning();

      res.status(201).json({
        orderId: payment.razorpayOrderId,
        amount: 0,
        currency: "INR",
        razorpayKeyId: getRazorpayKeyId(),
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
        walletAmountUsed: serverApprovedWalletUse,
        fullWallet: true,
        paymentId: payment.id,
        computedGrossAmount: totalAmount,
        ...computedComponents,
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: Math.round(razorpayAmount * 100),
      currency: "INR",
      notes: { type, referenceId, userId: profile.id, walletAmountUsed: serverApprovedWalletUse },
    });

    // HM10 PATCH 1 — Strict Capacity Enforcement & Atomic Reservation
    await db.transaction(async (tx) => {
      // 1. Lock the match row to prevent concurrent overbooking
      if ((type === "match_reserve" || type === "match_final" || type === "host_commitment") && referenceId && UUID_RE.test(referenceId)) {
        const [matchRow] = await tx
          .select({ totalPlayers: hostedMatchesTable.totalPlayers })
          .from(hostedMatchesTable)
          .where(eq(hostedMatchesTable.id, referenceId))
          .for("update")
          .limit(1);

        if (!matchRow) throw new Error("Match not found");

        const [participantsCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(hostedMatchParticipantsTable)
          .where(
            and(
              eq(hostedMatchParticipantsTable.matchId, referenceId),
              ne(hostedMatchParticipantsTable.status, "dropped_unpaid")
            )
          );

        const [reservationsCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(hostedMatchReservationsTable)
          .where(
            and(
              eq(hostedMatchReservationsTable.matchId, referenceId),
              eq(hostedMatchReservationsTable.isActive, true)
            )
          );

        if (Number(participantsCount.count) + Number(reservationsCount.count) >= matchRow.totalPlayers) {
          throw new Error("Match is full. Cannot create reservation.");
        }
      }

      await tx.insert(paymentsTable).values({
        userId: profile.id,
        type,
        referenceId: referenceId ?? null,
        razorpayOrderId: order.id,
        amount: totalAmount.toString(),
        grossAmount: totalAmount,
        paymentCategory: type === "host_commitment" || type === "match_reserve" || type === "match_final" ? type : "booking",
        hostFeeComponent: computedComponents.hostFeeComponent,
        reserveFeeComponent: computedComponents.reserveFeeComponent,
        finalFeeComponent: computedComponents.finalFeeComponent,
        walletComponent: serverApprovedWalletUse,
        refundComponent: 0,
        status: "payment_initiated",
      });

      // For match payment types, create a seat reservation
      if ((type === "match_reserve" || type === "match_final" || type === "host_commitment") && referenceId && UUID_RE.test(referenceId)) {
        const expiresAt = new Date(Date.now() + MATCH_RESERVATION_TIMEOUT_MINUTES * 60 * 1000);
        // HM10 PATCH 2 App-layer guard: unique active reservation is enforced by DB index,
        // but we also use onConflictDoNothing to silently ignore dupes in high concurrency.
        await tx
          .insert(hostedMatchReservationsTable)
          .values({
            matchId: referenceId,
            userId: profile.id,
            paymentOrderId: order.id,
            reservationStatus: "pending_payment",
            isActive: true,
            expiresAt,
          })
          .onConflictDoNothing();
      }
    });

    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: getRazorpayKeyId(),
      prefillName: profile.fullName,
      prefillEmail: profile.email,
      prefillContact: profile.phone ?? null,
      walletAmountUsed: serverApprovedWalletUse,
      fullWallet: false,
      computedGrossAmount: totalAmount,
      ...computedComponents,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating payment order");
    res.status(500).json({ error: "internal_error", message: "Failed to create payment order" });
  }
});

// ─── POST /payments/verify ────────────────────────────────────────────────────
// HM9 FORENSIC PATCH — Verify is now a RECONCILIATION FALLBACK:
// It is idempotent and safe to call multiple times.
// If the webhook already processed this payment, verify detects the terminal
// status and safely returns success without re-triggering side effects.
router.post("/payments/verify", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, type, referenceId, computedGrossAmount = 0, hostFeeComponent = 0, reserveFeeComponent = 0, finalFeeComponent = 0, walletAmountUsed = 0 } = req.body;

    const [existing] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
      .limit(1);

    // HM9: If webhook already finalized this payment, return success without re-running side effects
    const isAlreadyFinalized = existing && ["verified", "success", "payment_captured"].includes(existing.status);
    if (isAlreadyFinalized) {
      res.json({ success: true, paymentId: existing.id, referenceId, type, source: "webhook_already_processed" });
      return;
    }

    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid && process.env.RAZORPAY_KEY_SECRET) {
      res.status(400).json({ error: "invalid_signature", message: "Payment verification failed" });
      return;
    }

    let payment;
    if (existing) {
      const [updated] = await db
        .update(paymentsTable)
        .set({ razorpayPaymentId, razorpaySignature, status: "success", updatedAt: new Date() })
        .where(eq(paymentsTable.id, existing.id))
        .returning();
      payment = updated;
    } else {
      let insertValues: any = {
        userId: profile.id,
        type,
        referenceId: referenceId ?? null,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        amount: "0",
        status: "success",
      };

      if (type === "host_commitment") {
        insertValues = {
          ...insertValues,
          paymentCategory: "host_commitment",
          grossAmount: computedGrossAmount,
          hostFeeComponent,
          reserveFeeComponent,
          finalFeeComponent: 0,
          walletComponent: walletAmountUsed,
          refundComponent: 0,
          amount: String(computedGrossAmount),
        };
      } else if (type === "match_reserve") {
        insertValues = {
          ...insertValues,
          paymentCategory: "match_reserve",
          grossAmount: computedGrossAmount,
          hostFeeComponent: 0,
          reserveFeeComponent: computedGrossAmount,
          finalFeeComponent: 0,
          walletComponent: walletAmountUsed,
          refundComponent: 0,
          amount: String(computedGrossAmount),
        };
      } else if (type === "match_final") {
        insertValues = {
          ...insertValues,
          paymentCategory: "match_final",
          grossAmount: computedGrossAmount,
          hostFeeComponent: 0,
          reserveFeeComponent: 0,
          finalFeeComponent: computedGrossAmount,
          walletComponent: walletAmountUsed,
          refundComponent: 0,
          amount: String(computedGrossAmount),
        };
      }

      const [inserted] = await db.insert(paymentsTable).values(insertValues).returning();
      payment = inserted;
    }

    // HM9: Run all side effects through the shared post-payment module (idempotent)
    await runPostPaymentSideEffects({
      paymentId: payment.id,
      userId: profile.id,
      type,
      referenceId,
      amount: Number(payment.amount),
      grossAmount: Number(payment.grossAmount || payment.amount),
    });

    // HM9: If this is a reservation payment, we must convert it here in the fallback
    if (type === "host_commitment" || type === "match_reserve") {
      const [reservation] = await db
        .select({ id: hostedMatchReservationsTable.id })
        .from(hostedMatchReservationsTable)
        .where(eq(hostedMatchReservationsTable.paymentOrderId, razorpayOrderId))
        .limit(1);

      if (reservation) {
        await convertReservationToParticipant(reservation.id, payment.id);
      }
    }

    res.json({ success: true, paymentId: payment.id, referenceId, type, source: "verify_fallback" });
  } catch (err) {
    req.log.error({ err }, "Error verifying payment");
    res.status(500).json({ error: "internal_error", message: "Failed to verify payment" });
  }
});

router.get("/payments/history", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.userId, profile.id))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(50);

    res.json(
      payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        type: p.type,
        referenceId: p.referenceId ?? null,
        razorpayOrderId: p.razorpayOrderId ?? null,
        razorpayPaymentId: p.razorpayPaymentId ?? null,
        amount: Number(p.amount),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing payments");
    res.status(500).json({ error: "internal_error", message: "Failed to list payments" });
  }
});

router.get("/payments/pending", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const pending = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.userId, profile.id), eq(paymentsTable.status, "pending")))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(20);

    res.json(pending.map((p) => ({
      id: p.id,
      type: p.type,
      referenceId: p.referenceId ?? null,
      razorpayOrderId: p.razorpayOrderId ?? null,
      amount: Number(p.amount),
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing pending payments");
    res.status(500).json({ error: "internal_error", message: "Failed to list pending payments" });
  }
});

router.post("/payments/retry-verify", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId) {
      res.status(400).json({ error: "missing_params", message: "razorpayOrderId is required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.razorpayOrderId, razorpayOrderId), eq(paymentsTable.userId, profile.id)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Payment order not found" });
      return;
    }

    if (existing.status === "success") {
      res.json({ success: true, alreadyVerified: true, paymentId: existing.id, type: existing.type, referenceId: existing.referenceId });
      return;
    }

    if (razorpayPaymentId && razorpaySignature) {
      const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!isValid && process.env.RAZORPAY_KEY_SECRET) {
        res.status(400).json({ error: "invalid_signature", message: "Payment verification failed" });
        return;
      }
      const [updated] = await db
        .update(paymentsTable)
        .set({ razorpayPaymentId, razorpaySignature, status: "success", updatedAt: new Date() })
        .where(eq(paymentsTable.id, existing.id))
        .returning();
      await maybeMarkParticipantPaid(existing.type, existing.referenceId, profile.id);
      res.json({ success: true, alreadyVerified: false, paymentId: updated.id, type: updated.type, referenceId: updated.referenceId });
    } else {
      res.json({
        success: false,
        pending: true,
        paymentId: existing.id,
        type: existing.type,
        referenceId: existing.referenceId,
        razorpayOrderId: existing.razorpayOrderId,
        amount: Number(existing.amount),
      });
    }
  } catch (err) {
    req.log.error({ err }, "Error retrying payment verification");
    res.status(500).json({ error: "internal_error", message: "Failed to retry verification" });
  }
});

export default router;
