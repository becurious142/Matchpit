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

export const matchSkillLevelEnum = pgEnum("match_skill_level", [
  "beginner",
  "intermediate",
  "advanced",
  "any",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "open",
  "confirmed",
  "funded",
  "cancelled",
  "expired",
  "cancelled_underfilled",
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
  totalVenueCost: numeric("total_venue_cost", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  cityId: uuid("city_id").references(() => citiesTable.id),
  status: matchStatusEnum("status").notNull().default("open"),
  financialStatus: matchFinancialStatusEnum("financial_status").notNull().default("pending"),
  hostPaymentId: uuid("host_payment_id"),
  lockDeadline: timestamp("lock_deadline"),
  cancelledReason: text("cancelled_reason"),
  underfillRefundIssued: boolean("underfill_refund_issued").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHostedMatchSchema = createInsertSchema(hostedMatchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectHostedMatchSchema = createSelectSchema(hostedMatchesTable);

export type InsertHostedMatch = z.infer<typeof insertHostedMatchSchema>;
export type HostedMatch = typeof hostedMatchesTable.$inferSelect;
