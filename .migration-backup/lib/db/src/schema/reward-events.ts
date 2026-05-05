import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const rewardEventTypeEnum = pgEnum("reward_event_type", [
  "signup_bonus",
  "referral_referrer",
  "referral_referee",
  "first_booking_cashback",
  "first_match_cashback",
  "underfill_refund",
  "cancellation_refund",
  "admin_credit",
  "admin_debit",
]);

export const rewardEventsTable = pgTable("reward_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  eventType: rewardEventTypeEnum("event_type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  referenceId: uuid("reference_id"),
  referenceType: text("reference_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRewardEventSchema = createInsertSchema(rewardEventsTable).omit({
  id: true,
  createdAt: true,
});

export const selectRewardEventSchema = createSelectSchema(rewardEventsTable);

export type InsertRewardEvent = z.infer<typeof insertRewardEventSchema>;
export type RewardEvent = typeof rewardEventsTable.$inferSelect;
