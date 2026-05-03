import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const strikeTypeEnum = pgEnum("strike_type", [
  "spam",
  "drop_abuse",
  "referral_abuse",
  "no_show",
  "report",
]);

export const userStrikesTable = pgTable("user_strikes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: strikeTypeEnum("type").notNull(),
  points: integer("points").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserStrikeSchema = createInsertSchema(userStrikesTable).omit(
  { id: true, createdAt: true }
);

export const selectUserStrikeSchema = createSelectSchema(userStrikesTable);

export type InsertUserStrike = z.infer<typeof insertUserStrikeSchema>;
export type UserStrike = typeof userStrikesTable.$inferSelect;
