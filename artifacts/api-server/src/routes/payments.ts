import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { paymentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";

const router: IRouter = Router();

router.post("/payments/create-order", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { type, referenceId, amount } = req.body;

    if (!razorpay) {
      // Dev mode: return mock order if no Razorpay keys configured
      res.status(201).json({
        orderId: `order_dev_${Date.now()}`,
        amount: Math.round(amount * 100),
        currency: "INR",
        razorpayKeyId: "rzp_test_placeholder",
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      notes: { type, referenceId, userId: profile.id },
    });

    // Create pending payment record
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

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, type, referenceId } = req.body;

    // Idempotency: if this payment was already verified, return existing record
    const [existing] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
      .limit(1);
    if (existing && existing.status === "success") {
      res.json({ success: true, paymentId: existing.id, referenceId, type });
      return;
    }

    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      // In dev mode without keys, allow through
      if (!process.env.RAZORPAY_KEY_SECRET) {
        const [payment] = await db.insert(paymentsTable).values({
          userId: profile.id,
          type,
          referenceId: referenceId ?? null,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amount: "0",
          status: "success",
        }).returning();

        res.json({ success: true, paymentId: payment.id, referenceId, type });
        return;
      }

      res.status(400).json({ error: "invalid_signature", message: "Payment verification failed" });
      return;
    }

    const [payment] = await db.insert(paymentsTable).values({
      userId: profile.id,
      type,
      referenceId: referenceId ?? null,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount: "0",
      status: "success",
    }).returning();

    res.json({ success: true, paymentId: payment.id, referenceId, type });
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

export default router;
