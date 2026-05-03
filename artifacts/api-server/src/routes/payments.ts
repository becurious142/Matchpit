import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchParticipantsTable,
  bookingsTable,
  hostedMatchesTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";
import { processReferralRewards, processFirstBookingCashback, processFirstMatchCashback } from "../lib/wallet";
import { generateBookingPayout, generateMatchPayout } from "../lib/payouts";

const router: IRouter = Router();

router.post("/payments/create-order", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { type, referenceId, amount, walletAmountUsed = 0 } = req.body;
    const razorpayAmount = Math.max(0, amount - walletAmountUsed);

    if (!razorpay) {
      res.status(201).json({
        orderId: `order_dev_${Date.now()}`,
        amount: Math.round(razorpayAmount * 100),
        currency: "INR",
        razorpayKeyId: "rzp_test_placeholder",
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
        walletAmountUsed,
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
        amount: amount.toString(),
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
        walletAmountUsed,
        fullWallet: true,
        paymentId: payment.id,
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: Math.round(razorpayAmount * 100),
      currency: "INR",
      notes: { type, referenceId, userId: profile.id, walletAmountUsed },
    });

    await db.insert(paymentsTable).values({
      userId: profile.id,
      type,
      referenceId: referenceId ?? null,
      razorpayOrderId: order.id,
      amount: amount.toString(),
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
      walletAmountUsed,
      fullWallet: false,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating payment order");
    res.status(500).json({ error: "internal_error", message: "Failed to create payment order" });
  }
});

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

    if (existing && existing.status === "success") {
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

    // Post-payment commerce triggers (all non-blocking)
    setImmediate(async () => {
      try {
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
        }
        if (type === "match_reserve" && referenceId) {
          await processReferralRewards(profile.id);
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
        }
      } catch (triggerErr) {
        // Non-critical — log but don't fail the response
      }
    });

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

export default router;
