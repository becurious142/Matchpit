import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchParticipantsTable,
  bookingsTable,
  hostedMatchesTable,
  profilesTable,
  venuesTable,
  slotsTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";
import { processReferralRewards, processFirstBookingCashback, processFirstMatchCashback } from "../lib/wallet";
import { generateBookingPayout, generateMatchPayout } from "../lib/payouts";
import { createNotification } from "../lib/notifications";
import { trackEvent, EVENTS } from "../lib/analytics";
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

    // ── Re-read wallet balance — never trust client value ──
    const [freshProfile] = await db
      .select({ walletBalance: profilesTable.walletBalance, walletAutoUse: profilesTable.walletAutoUse })
      .from(profilesTable)
      .where(eq(profilesTable.id, profile.id))
      .limit(1);
    const actualBalance = Number(freshProfile?.walletBalance ?? 0);

    let totalAmount: number;

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
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: Math.round(razorpayAmount * 100),
      currency: "INR",
      notes: { type, referenceId, userId: profile.id, walletAmountUsed: serverApprovedWalletUse },
    });

    await db.insert(paymentsTable).values({
      userId: profile.id,
      type,
      referenceId: referenceId ?? null,
      razorpayOrderId: order.id,
      amount: totalAmount.toString(),
      status: "pending",
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
    });
  } catch (err) {
    req.log.error({ err }, "Error creating payment order");
    res.status(500).json({ error: "internal_error", message: "Failed to create payment order" });
  }
});

// ─── POST /payments/verify ────────────────────────────────────────────────────
router.post("/payments/verify", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, type, referenceId } = req.body;

    const [existing] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
      .limit(1);

    if (existing?.status === "success") {
      await maybeMarkParticipantPaid(type, referenceId, profile.id);
      res.json({ success: true, paymentId: existing.id, referenceId, type });
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
      const [inserted] = await db
        .insert(paymentsTable)
        .values({
          userId: profile.id,
          type,
          referenceId: referenceId ?? null,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amount: "0",
          status: "success",
        })
        .returning();
      payment = inserted;
    }

    await maybeMarkParticipantPaid(type, referenceId, profile.id);

    const amount = Number(payment.amount);

    if (type === "booking" && referenceId) {
      const [booking] = await db
        .select({ venueId: bookingsTable.venueId })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, referenceId))
        .limit(1);
      if (booking) {
        await generateBookingPayout(booking.venueId, referenceId, amount);
      }
      await processFirstBookingCashback(profile.id, referenceId);
      await processReferralRewards(profile.id);
      try { await trackEvent(EVENTS.BOOKING_PAID, profile.id, { referenceId, amount }); } catch (e) { logger.warn({ err: e }, "analytics track failed"); }
      try {
        await createNotification({
          userId: profile.id,
          type: "payment_success",
          title: "Booking Confirmed!",
          body: "Your turf booking is confirmed. Check your dashboard for details.",
          referenceId,
        });
      } catch (e) { logger.warn({ err: e }, "notification failed"); }
    }

    if (type === "host_commitment" && referenceId) {
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) {
        await generateMatchPayout(match.venueId, referenceId, amount);
      }
      await processFirstMatchCashback(profile.id, referenceId);
      await processReferralRewards(profile.id);
      try { await trackEvent(EVENTS.HOST_MATCH_PAID, profile.id, { referenceId, amount }); } catch (e) { logger.warn({ err: e }, "analytics track failed"); }
      try {
        await createNotification({
          userId: profile.id,
          type: "payment_success",
          title: "Match Created!",
          body: "Your hosted match is live. Share it to fill up your squad!",
          referenceId,
        });
      } catch (e) { logger.warn({ err: e }, "notification failed"); }
    }

    if (type === "match_reserve" && referenceId) {
      await processReferralRewards(profile.id);
      try { await trackEvent(EVENTS.RESERVE_JOIN_PAID, profile.id, { referenceId, amount }); } catch (e) { logger.warn({ err: e }, "analytics track failed"); }
      try {
        await createNotification({
          userId: profile.id,
          type: "payment_success",
          title: "Spot Reserved!",
          body: "You've secured your spot. Final payment due when the match is confirmed.",
          referenceId,
        });
      } catch (e) { logger.warn({ err: e }, "notification failed"); }
    }

    if (type === "match_final" && referenceId) {
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId, finalFeePerPlayer: hostedMatchesTable.finalFeePerPlayer })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) {
        await generateMatchPayout(match.venueId, referenceId, Number(match.finalFeePerPlayer));
      }
      try { await trackEvent(EVENTS.FINAL_PAYMENT_PAID, profile.id, { referenceId, amount }); } catch (e) { logger.warn({ err: e }, "analytics track failed"); }
      try {
        await createNotification({
          userId: profile.id,
          type: "payment_success",
          title: "Final Payment Done!",
          body: "You're fully paid. See you on the pitch!",
          referenceId,
        });
      } catch (e) { logger.warn({ err: e }, "notification failed"); }
    }

    res.json({ success: true, paymentId: payment.id, referenceId, type });
  } catch (err) {
    req.log.error({ err }, "Error verifying payment");
    res.status(500).json({ error: "internal_error", message: "Failed to verify payment" });
  }
});

async function maybeMarkParticipantPaid(
  type: string,
  referenceId: string | null,
  userId: string,
): Promise<void> {
  if (type !== "match_final" || !referenceId) return;
  await db
    .update(hostedMatchParticipantsTable)
    .set({ status: "final_paid", updatedAt: new Date() })
    .where(
      and(
        eq(hostedMatchParticipantsTable.matchId, referenceId),
        eq(hostedMatchParticipantsTable.userId, userId),
      ),
    );
}

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
