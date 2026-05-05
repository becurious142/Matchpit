import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playerFollowsTable = pgTable("player_follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerUserId: uuid("follower_user_id").notNull(),
  followingUserId: uuid("following_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlayerFollowSchema = createInsertSchema(playerFollowsTable).omit({
  id: true,
  createdAt: true,
});
export const selectPlayerFollowSchema = createSelectSchema(playerFollowsTable);

export type InsertPlayerFollow = z.infer<typeof insertPlayerFollowSchema>;
export type PlayerFollow = typeof playerFollowsTable.$inferSelect;
