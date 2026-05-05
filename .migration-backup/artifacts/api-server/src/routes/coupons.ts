import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { couponsTable, bookingsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

router.post("/coupons/validate", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { code, amount, citySlug, sport } = req.body as {
      code: string;
      amount: number;
      citySlug?: string;
      sport?: string;
    };

    if (!code || !amount) {
      res.status(400).json({ error: "validation_error", message: "code and amount are required" });
      return;
    }

    const [coupon] = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.code, code.toUpperCase().trim()))
      .limit(1);

    if (!coupon) {
      res.status(404).json({ error: "not_found", message: "Coupon not found" });
      return;
    }

    if (!coupon.isActive) {
      res.status(400).json({ error: "coupon_inactive", message: "Coupon is no longer active" });
      return;
    }

    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      res.status(400).json({ error: "coupon_expired", message: "Coupon has expired" });
      return;
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ error: "coupon_exhausted", message: "Coupon usage limit reached" });
      return;
    }

    if (coupon.minAmount && amount < Number(coupon.minAmount)) {
      res.status(400).json({
        error: "min_amount_not_met",
        message: `Minimum order amount is ₹${coupon.minAmount}`,
      });
      return;
    }

    if (coupon.citySlug && citySlug && coupon.citySlug !== citySlug) {
      res.status(400).json({ error: "city_mismatch", message: "Coupon not valid for this city" });
      return;
    }

    if (coupon.sport && sport && coupon.sport !== sport) {
      res.status(400).json({ error: "sport_mismatch", message: "Coupon not valid for this sport" });
      return;
    }

    if (coupon.firstBookingOnly) {
      const existing = await db
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.userId, profile.id), eq(bookingsTable.status, "confirmed")))
        .limit(1);
      if (existing.length > 0) {
        res.status(400).json({
          error: "not_first_booking",
          message: "Coupon is valid for first booking only",
        });
        return;
      }
    }

    const discount =
      coupon.type === "flat"
        ? Math.min(Number(coupon.value), amount)
        : Math.round((amount * Number(coupon.value)) / 100);

    res.json({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      discount,
      finalAmount: amount - discount,
    });
  } catch (err) {
    req.log.error({ err }, "Error validating coupon");
    res.status(500).json({ error: "internal_error", message: "Failed to validate coupon" });
  }
});

export default router;
