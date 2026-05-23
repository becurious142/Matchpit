import { db, couponsTable, bookingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class CouponEngine {
  /**
   * Validates a coupon code against financial constraints before applying.
   */
  static async validateCoupon(code: string, userId: string, cartAmount: number): Promise<{ isValid: boolean; discountAmount: number; error?: string }> {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));

    if (!coupon || !coupon.isActive) {
      return { isValid: false, discountAmount: 0, error: "Invalid or inactive coupon" };
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return { isValid: false, discountAmount: 0, error: "Coupon expired" };
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { isValid: false, discountAmount: 0, error: "Coupon usage limit reached" };
    }

    if (coupon.minAmount && cartAmount < Number(coupon.minAmount)) {
      return { isValid: false, discountAmount: 0, error: `Minimum order amount of ₹${coupon.minAmount} required` };
    }

    if (coupon.firstBookingOnly) {
      const [{ bookingCount }] = await db.execute(sql`
        SELECT COUNT(id) as "bookingCount" FROM ${bookingsTable} WHERE user_id = ${userId}
      `);
      if (Number(bookingCount) > 0) {
        return { isValid: false, discountAmount: 0, error: "Coupon valid for first booking only" };
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === "flat") {
      discountAmount = Number(coupon.value);
    } else if (coupon.type === "percent") {
      discountAmount = cartAmount * (Number(coupon.value) / 100);
      // Hard cap percent discounts at ₹500 usually, but simplified here
      discountAmount = Math.min(discountAmount, 500); 
    }

    // Financial Boundaries: Check platform subsidy cap
    if (coupon.fundedBy === "platform" && coupon.maxPlatformSubsidy) {
      const currentSubsidy = Number(coupon.currentPlatformSubsidy || 0);
      if (currentSubsidy + discountAmount > Number(coupon.maxPlatformSubsidy)) {
        return { isValid: false, discountAmount: 0, error: "Coupon budget exhausted" };
      }
    }

    return { isValid: true, discountAmount };
  }

  /**
   * Applies the coupon and increments counters transactionally.
   */
  static async commitCouponUsage(code: string, discountAmount: number) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
    if (!coupon) return;

    const updates: any = {
      usedCount: sql`used_count + 1`
    };

    if (coupon.fundedBy === "platform") {
      updates.currentPlatformSubsidy = sql`current_platform_subsidy + ${discountAmount}`;
    }

    await db.update(couponsTable)
      .set(updates)
      .where(eq(couponsTable.id, coupon.id));
      
    logger.info({ code, discountAmount }, "Coupon usage committed");
  }
}
