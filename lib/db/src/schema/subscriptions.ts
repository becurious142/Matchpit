import {
  pgTable,
  uuid,
  timestamp,
  text,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

/**
 * Plans Schema
 * As per Phase 18 constraints, do NOT hardcode MATCHPIT Plus.
 * This is plan-agnostic (can support user plans, venue plans, etc).
 */
export const plansTable = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // e.g. "MATCHPIT Plus"
  type: text("type", { enum: ["user", "venue", "organizer"] }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  
  // Entitlements are JSON for flexibility (e.g. { "earlyBookingHours": 24, "feeDiscountPct": 10 })
  entitlements: jsonb("entitlements").notNull().default({}),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * User Subscriptions Schema
 */
export const userSubscriptionsTable = pgTable("user_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profilesTable.id),
  planId: uuid("plan_id").notNull().references(() => plansTable.id),
  
  status: text("status", { enum: ["active", "past_due", "canceled", "expired"] }).notNull().default("active"),
  
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plansTable);
export const selectPlanSchema = createSelectSchema(plansTable);

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptionsTable);
export const selectUserSubscriptionSchema = createSelectSchema(userSubscriptionsTable);

export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;

export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type UserSubscription = typeof userSubscriptionsTable.$inferSelect;
