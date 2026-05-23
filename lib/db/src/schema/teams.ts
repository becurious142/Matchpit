import {
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

/**
 * Teams Schema (Competitive, Smaller, Invite-only)
 */
export const teamsTable = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  sport: text("sport").notNull(),
  city: text("city").notNull(),
  
  // Competitive stats
  matchesPlayed: text("matches_played").default("0"),
  winRatePct: text("win_rate_pct").default("0"),
  
  isLookingForPlayers: boolean("is_looking_for_players").default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teamsTable);
export const selectTeamSchema = createSelectSchema(teamsTable);

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
