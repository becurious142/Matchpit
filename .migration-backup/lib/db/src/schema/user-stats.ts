import {
  pgTable,
  integer,
  numeric,
  timestamp,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const userStatsTable = pgTable("user_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  totalBookings: integer("total_bookings").notNull().default(0),
  completedBookings: integer("completed_bookings").notNull().default(0),
  cancelledBookings: integer("cancelled_bookings").notNull().default(0),
  totalHostedMatches: integer("total_hosted_matches").notNull().default(0),
  completedHostedMatches: integer("completed_hosted_matches").notNull().default(0),
  totalMatchesJoined: integer("total_matches_joined").notNull().default(0),
  noShowCount: integer("no_show_count").notNull().default(0),
  reliabilityScore: numeric("reliability_score", { precision: 5, scale: 2 }).notNull().default("100"),
  totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).notNull().default("0"),
  isVerified: boolean("is_verified").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserStatsSchema = createInsertSchema(userStatsTable).omit({
  id: true,
  updatedAt: true,
});

export const selectUserStatsSchema = createSelectSchema(userStatsTable);

export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;
export type UserStats = typeof userStatsTable.$inferSelect;
