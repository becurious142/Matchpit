import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const matchMessagesTable = pgTable("match_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull(),
  userId: uuid("user_id").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMatchMessageSchema = createInsertSchema(matchMessagesTable).omit({
  id: true,
  createdAt: true,
});
export const selectMatchMessageSchema = createSelectSchema(matchMessagesTable);

export type InsertMatchMessage = z.infer<typeof insertMatchMessageSchema>;
export type MatchMessage = typeof matchMessagesTable.$inferSelect;
