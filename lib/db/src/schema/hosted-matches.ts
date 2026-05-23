import {
  pgTable,
  text,
  numeric,
  integer,
  timestamp,
  uuid,
  date,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";
import { slotsTable } from "./slots";
import { profilesTable } from "./profiles";
import { citiesTable } from "./cities";
import { geography } from "./geo";
import { index } from "drizzle-orm/pg-core";

export const matchSkillLevelEnum = pgEnum("match_skill_level", [
  "beginner",
  "intermediate",
  "advanced",
  "any",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "open",
  "confirmed",
  "fully_paid",
  "completed",
  "funded",
  "cancelled",
  "expired",
  "cancelled_underfilled",
  "pending_verification", // Phase 3: awaiting attendance quorum
  "disputed",            // Phase 3: quorum not reached after grace period
  "risk_hold",           // Phase 9: held for risk review
]);

export const matchFinancialStatusEnum = pgEnum("match_financial_status", [
  "pending",
  "partially_funded",
  "funded",
]);

export const hostedMatchesTable = pgTable("hosted_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostUserId: uuid("host_user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venuesTable.id),
  slotId: uuid("slot_id")
    .notNull()
    .references(() => slotsTable.id),
  sport: text("sport").notNull(),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  totalPlayers: integer("total_players").notNull(),
  minPlayers: integer("min_players").notNull(),
  currentPlayers: integer("current_players").notNull().default(0),
  skillLevel: matchSkillLevelEnum("skill_level").notNull().default("any"),
  hostFee: numeric("host_fee", { precision: 10, scale: 2 }).notNull().default("99"),
  reserveFee: numeric("reserve_fee", { precision: 10, scale: 2 }).notNull(),
  finalFeePerPlayer: numeric("final_fee_per_player", { precision: 10, scale: 2 }).notNull(),
  totalVenueCost: integer("total_venue_cost").default(0).notNull(),
  grossHostCollected: integer("gross_host_collected").default(0).notNull(),
  grossReserveCollected: integer("gross_reserve_collected").default(0).notNull(),
  grossFinalCollected: integer("gross_final_collected").default(0).notNull(),
  totalCollected: integer("total_collected").default(0).notNull(),
  platformFeeTotal: integer("platform_fee_total").default(0).notNull(),
  refundExposure: integer("refund_exposure").default(0).notNull(),
  notes: text("notes"),
  cityId: uuid("city_id").references(() => citiesTable.id),
  status: matchStatusEnum("status").notNull().default("open"),
  financialStatus: matchFinancialStatusEnum("financial_status").notNull().default("pending"),
  hostPaymentId: uuid("host_payment_id"),
  lockDeadline: timestamp("lock_deadline"),
  cancelledReason: text("cancelled_reason"),
  underfillRefundIssued: boolean("underfill_refund_issued").notNull().default(false),
  // Phase 3: Attendance verification
  verificationDeadline: timestamp("verification_deadline"),   // 48h after match end
  settlementReleasesAt: timestamp("settlement_releases_at"),  // 24h after quorum reached
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  coordinates: geography("coordinates"),
}, (table) => ({
  coordinatesIdx: index("hosted_matches_coordinates_idx").using("gist", table.coordinates),
}));

export const insertHostedMatchSchema = createInsertSchema(hostedMatchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectHostedMatchSchema = createSelectSchema(hostedMatchesTable);

export type InsertHostedMatch = z.infer<typeof insertHostedMatchSchema>;
export type HostedMatch = typeof hostedMatchesTable.$inferSelect;
