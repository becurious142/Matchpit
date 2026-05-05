import {
  pgTable,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const couponTypeEnum = pgEnum("coupon_type", ["flat", "percent"]);

export const couponsTable = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: couponTypeEnum("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  minAmount: numeric("min_amount", { precision: 10, scale: 2 }),
  firstBookingOnly: boolean("first_booking_only").notNull().default(false),
  citySlug: text("city_slug"),
  sport: text("sport"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({
  id: true,
  usedCount: true,
  createdAt: true,
});

export const selectCouponSchema = createSelectSchema(couponsTable);

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
