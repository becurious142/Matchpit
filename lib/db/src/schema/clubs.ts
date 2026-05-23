import {
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Clubs Schema (Social, Larger, Public/Community-focused)
 */
export const clubsTable = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  bannerUrl: text("banner_url"),
  sport: text("sport").notNull(),
  city: text("city").notNull(),
  
  isPublic: boolean("is_public").default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClubSchema = createInsertSchema(clubsTable);
export const selectClubSchema = createSelectSchema(clubsTable);

export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubsTable.$inferSelect;
