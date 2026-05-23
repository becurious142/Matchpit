import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

// ─── referral_status enum (Phase 5) ──────────────────────────────────────────
export const referralStatusEnum = pgEnum("referral_status", [
  "pending",    // referred user signed up, not yet qualified
  "qualified",  // referred user completed first paid match
  "credited",   // rewards paid to both parties
  "reversed",   // rewards reversed (e.g., refund)
  "expired",    // expired without qualification
  "pending_review", // Phase 9: held for risk evaluation
]);

export type ReferralStatus = (typeof referralStatusEnum.enumValues)[number];

// ─── referrals table (Phase 5) ────────────────────────────────────────────────
export const referralsTable = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),

    // One referred user can only be referred once (enforced by uniqueIndex)
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),

    // The referral code that was used
    referralCode: text("referral_code").notNull(),

    status: referralStatusEnum("status").notNull().default("pending"),

    // Reward amount for the referrer (₹100 default)
    rewardAmount: numeric("reward_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("100"),

    // Reward amount for the invitee (₹50 default)
    inviteeRewardAmount: numeric("invitee_reward_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("50"),

    // Lifecycle timestamps
    qualifiedAt: timestamp("qualified_at"),
    creditedAt: timestamp("credited_at"),
    reversedAt: timestamp("reversed_at"),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),

    // Abuse tracking
    abuseScore: numeric("abuse_score", { precision: 5, scale: 2 }).default("0"),
    isFlagged: boolean("is_flagged").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Each user can only be referred once
    uniqueIndex("idx_referrals_referred_user").on(table.referredUserId),
    // Quick lookup by referral code
    index("idx_referrals_code").on(table.referralCode),
    // Referrer's referral history
    index("idx_referrals_referrer").on(table.referrerUserId),
  ]
);

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectReferralSchema = createSelectSchema(referralsTable);

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
