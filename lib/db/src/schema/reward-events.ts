import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

// ─── reward_event_type enum ───────────────────────────────────────────────────
// Includes both legacy values (Phase 2A) and Phase 5 values.
// Migration uses ADD VALUE IF NOT EXISTS to extend the PG enum safely.
export const rewardEventTypeEnum = pgEnum("reward_event_type", [
  // ── Legacy (Phase 2A/2B) ──
  "signup_bonus",
  "referral_referrer",
  "referral_referee",
  "first_booking_cashback",
  "underfill_refund",
  "cancellation_refund",
  "admin_credit",
  "admin_debit",
  "host_milestone_reward", // used in wallet.ts processHostMilestoneRewards
  // ── Phase 5 canonical types ──
  "first_match_cashback",
  "milestone_reward",
  "referral_reward",
  "host_bonus",
  "manual_reward",
]);

export type RewardEventType =
  (typeof rewardEventTypeEnum.enumValues)[number];

// ─── reward_status enum (Phase 5) ────────────────────────────────────────────
export const rewardStatusEnum = pgEnum("reward_status", [
  "pending",
  "credited",
  "reversed",
  "expired",
]);

export type RewardStatus = (typeof rewardStatusEnum.enumValues)[number];

// ─── reward_events table ──────────────────────────────────────────────────────
export const rewardEventsTable = pgTable(
  "reward_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),

    eventType: rewardEventTypeEnum("event_type").notNull(),

    // Optional reference to the triggering entity (payment, match, etc.)
    referenceId: uuid("reference_id"),
    referenceType: text("reference_type"),

    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

    // Phase 5: lifecycle tracking
    status: rewardStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    processedAt: timestamp("processed_at"),
    reversedAt: timestamp("reversed_at"),

    // Metadata + notes (notes kept for backward compat)
    notes: text("notes"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Idempotency: same (user, event_type, reference_id) cannot be credited twice.
    // WHERE clause excludes NULL reference_ids (milestones with no entity ref).
    uniqueIndex("idx_reward_events_dedup")
      .on(table.userId, table.eventType, table.referenceId)
      .where(sql`${table.referenceId} IS NOT NULL`),
    index("idx_reward_events_status")
      .on(table.status, table.expiresAt),
  ]
);

export const insertRewardEventSchema = createInsertSchema(
  rewardEventsTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectRewardEventSchema = createSelectSchema(rewardEventsTable);

export type InsertRewardEvent = z.infer<typeof insertRewardEventSchema>;
export type RewardEvent = typeof rewardEventsTable.$inferSelect;
