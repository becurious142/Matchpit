import {
  pgTable,
  uuid,
  timestamp,
  text,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";

/**
 * Tournaments Schema
 * Phase 18 constraints: Manual brackets, manual scoring, strict prize pool financial isolation.
 */
export const tournamentsTable = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  organizerId: uuid("organizer_id").notNull(), // User who created it
  venueId: uuid("venue_id").references(() => venuesTable.id), // If tied to a specific venue
  sport: text("sport").notNull(),
  
  format: text("format", { enum: ["knockout", "round_robin"] }).notNull().default("knockout"),
  status: text("status", { enum: ["draft", "registration", "active", "completed", "disputed"] }).notNull().default("draft"),
  
  // Prize Pool tracked strictly (ties into financial ledger when settled)
  prizePoolAmount: numeric("prize_pool_amount", { precision: 12, scale: 2 }).default("0"),
  entryFee: numeric("entry_fee", { precision: 10, scale: 2 }).default("0"),
  
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable);
export const selectTournamentSchema = createSelectSchema(tournamentsTable);

export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
