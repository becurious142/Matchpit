import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityPostLikesTable = pgTable("community_post_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull(),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunityPostLikeSchema = createInsertSchema(communityPostLikesTable).omit({
  id: true,
  createdAt: true,
});
export const selectCommunityPostLikeSchema = createSelectSchema(communityPostLikesTable);

export type InsertCommunityPostLike = z.infer<typeof insertCommunityPostLikeSchema>;
export type CommunityPostLike = typeof communityPostLikesTable.$inferSelect;
