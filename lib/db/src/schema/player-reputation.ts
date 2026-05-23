import {
  pgTable,
  uuid,
  integer,
  numeric,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const playerReputationTable = pgTable("player_reputation", {
  userId: uuid("user_id").primaryKey().references(() => profilesTable.id, { onDelete: "cascade" }),
  
  // Qualitative Reputation Tiers (As per Phase 18 constraints, don't expose raw % to UI)
  reliabilityTier: text("reliability_tier", { 
    enum: ["Highly Reliable", "Regular Player", "New Player", "Frequently Cancels"] 
  }).notNull().default("New Player"),

  // Internal Analytics (Not exposed raw)
  totalMatchesPlayed: integer("total_matches_played").notNull().default(0),
  attendanceRatePct: numeric("attendance_rate_pct", { precision: 5, scale: 2 }).default("100.00"),
  cancellationRatePct: numeric("cancellation_rate_pct", { precision: 5, scale: 2 }).default("0.00"),
  
  // Abuse & Moderation tracking
  noShowFlags: integer("no_show_flags").notNull().default(0),
  communityReports: integer("community_reports").notNull().default(0),
  
  // Moderation Reputation (Phase 18 addition: Trusted reporters weigh more)
  moderationReputationScore: numeric("moderation_reputation_score", { precision: 5, scale: 2 }).default("50.00"),

  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertPlayerReputationSchema = createInsertSchema(playerReputationTable);
export const selectPlayerReputationSchema = createSelectSchema(playerReputationTable);

export type InsertPlayerReputation = z.infer<typeof insertPlayerReputationSchema>;
export type PlayerReputation = typeof playerReputationTable.$inferSelect;
