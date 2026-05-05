import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchParticipantsTable,
  bookingsTable,
  hostedMatchesTable,
  profilesTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";
import { processReferralRewards, processFirstBookingCashback, processFirstMatchCashback } from "../lib/wallet";
import { generateBookingPayout, generateMatchPayout } from "../lib/payouts";
import { createNotification } from "../lib/notifications";
import { trackEvent, EVENTS } from "../lib/analytics";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── POST /payments/create-order ─────────────────────────────────────────────
// C2: wallet amount is clamped server-side against real DB balance.
// Client-supplied walletAmountUsed is treated as a hint, never trusted directly.
router.post("/payments/create-order", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { type, referenceId, amount: rawAmount, walletAmountUsed: clientWalletHint = 0 } = req.body;
    const totalAmount = Number(rawAmount);

    if (!totalAmount || totalAmount <= 0) {
      res.status(400).json({ error: "validation", message: "amount must be a positive number" });
      return;
    }

    // C2: Re-read wallet balance from DB — never trust client-supplied value
    const [freshProfile] = await db
      .select({ walletBalance: profilesTable.walletBalance, walletAutoUse: profilesTable.walletAutoUse })
      .from(profilesTable)
      .where(eq(profilesTable.id, profile.id))
      .limit(1);

    const actualBalance = Number(freshProfile?.walletBalance ?? 0);

    // Clamp: cannot use more than balance, more than total, or more than client requested
    const serverApprovedWalletUse = Math.min(
      Number(clientWalletHint),
      actualBalance,
      totalAmount,
    );

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
      });
      return;
    }

    if (razorpayAmount === 0) {
      // Full wallet payment — no Razorpay needed
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
    });
  } catch (err) {
    req.log.error({ err }, "Error creating payment order");
    res.status(500).json({ error: "internal_error", message: "Failed to create payment order" });
  }
});

// ─── POST /payments/verify ────────────────────────────────────────────────────
// C1: All post-payment commerce (payout, cashback, referral) is awaited inside
// the request lifecycle before res.json(). No setImmediate / fire-and-forget.
// Non-critical steps (notifications, analytics) are individually try/caught so
// a notification failure never aborts the financial steps.
router.post("/payments/verify", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      type,
      referenceId,
    } = req.body;

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
        .set({
          razorpayPaymentId,
          razorpaySignature,
          status: "success",
          updatedAt: new Date(),
        })
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

    // ── C1: Post-payment commerce — awaited before response ──────────────────
    // Financial steps (payout, cashback, referral) must complete before we
    // respond. Notifications and analytics are best-effort — failures are
    // logged but do not abort the response.
    const amount = Number(payment.amount);

    if (type === "booking" && referenceId) {
      // Financial — must succeed
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
      // Non-critical
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
      // Financial — must succeed
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
      // Non-critical
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
      // Financial — must succeed
      await processReferralRewards(profile.id);
      // Non-critical
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
      // Financial — must succeed
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId, finalFeePerPlayer: hostedMatchesTable.finalFeePerPlayer })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) {
        await generateMatchPayout(match.venueId, referenceId, Number(match.finalFeePerPlayer));
      }
      // Non-critical
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

// ─── List pending/stuck orders for current user ────────────────────────────
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

// ─── Idempotent retry-verify for stuck/abandoned orders ───────────────────
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
      // Return the pending order details so client can re-open Razorpay
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
