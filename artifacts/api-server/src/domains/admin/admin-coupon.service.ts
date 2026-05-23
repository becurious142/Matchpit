import { db } from "@workspace/db";
import { couponsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export class AdminCouponService {
  async getCoupons() {
    return db
      .select()
      .from(couponsTable)
      .orderBy(desc(couponsTable.createdAt));
  }

  async createCoupon(params: {
    code: string;
    type: "flat" | "percent";
    value: number;
    maxUses?: number;
    minAmount?: number;
    firstBookingOnly?: boolean;
    citySlug?: string;
    sport?: string;
    expiresAt?: string;
  }) {
    const [coupon] = await db
      .insert(couponsTable)
      .values({
        code: params.code.toUpperCase().trim(),
        type: params.type,
        value: String(params.value),
        maxUses: params.maxUses ?? null,
        minAmount: params.minAmount ? String(params.minAmount) : null,
        firstBookingOnly: params.firstBookingOnly ?? false,
        citySlug: params.citySlug ?? null,
        sport: params.sport ?? null,
        expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
        isActive: true,
      })
      .returning();
    return coupon;
  }

  async updateCoupon(couponId: string, updates: { isActive?: boolean; maxUses?: number | null; expiresAt?: string | null }) {
    const setFields: Record<string, unknown> = {};
    if (updates.isActive !== undefined) setFields.isActive = updates.isActive;
    if (updates.maxUses !== undefined) setFields.maxUses = updates.maxUses;
    if (updates.expiresAt !== undefined) {
      setFields.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
    }

    const [updated] = await db
      .update(couponsTable)
      .set(setFields)
      .where(eq(couponsTable.id, couponId))
      .returning();
    return updated;
  }
}

export const adminCouponService = new AdminCouponService();
