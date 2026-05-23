import {
  pgTable,
  timestamp,
  uuid,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";
import { hostedMatchesTable } from "./hosted-matches";

export const waitlistStatusEnum = pgEnum("waitlist_status", [
  "waiting",
  "promoted", // Automatically promoted to reserved
  "expired",  // Didn't complete payment in time after promotion
  "cancelled" // User left the waitlist manually
]);

export const waitlistTable = pgTable("hosted_match_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => hostedMatchesTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  status: waitlistStatusEnum("status").notNull().default("waiting"),
  
  // Track promotion windows
  promotedAt: timestamp("promoted_at"),
  expiresAt: timestamp("expires_at"),
  
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_waitlist_match_user").on(table.matchId, table.userId),
]);

export const insertWaitlistSchema = createInsertSchema(waitlistTable).omit({ id: true, joinedAt: true, updatedAt: true });
export const selectWaitlistSchema = createSelectSchema(waitlistTable);

export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;
export type WaitlistEntry = typeof waitlistTable.$inferSelect;
