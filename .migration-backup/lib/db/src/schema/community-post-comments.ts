import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityPostCommentsTable = pgTable("community_post_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull(),
  userId: uuid("user_id").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunityPostCommentSchema = createInsertSchema(communityPostCommentsTable).omit({
  id: true,
  createdAt: true,
});
export const selectCommunityPostCommentSchema = createSelectSchema(communityPostCommentsTable);

export type InsertCommunityPostComment = z.infer<typeof insertCommunityPostCommentSchema>;
export type CommunityPostComment = typeof communityPostCommentsTable.$inferSelect;
