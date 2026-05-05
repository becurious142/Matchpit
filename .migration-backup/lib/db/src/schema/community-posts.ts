import { pgTable, text, uuid, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityPostTypeEnum = pgEnum("community_post_type", [
  "text",
  "image",
  "looking_players",
  "match_result",
  "challenge",
  "venue_review",
  "achievement",
]);

export const communityPostsTable = pgTable("community_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  cityId: uuid("city_id"),
  type: communityPostTypeEnum("type").notNull().default("text"),
  caption: text("caption").notNull(),
  imageUrl: text("image_url"),
  relatedMatchId: uuid("related_match_id"),
  relatedVenueId: uuid("related_venue_id"),
  relatedSquadId: uuid("related_squad_id"),
  sport: text("sport"),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunityPostSchema = createInsertSchema(communityPostsTable).omit({
  id: true,
  likesCount: true,
  commentsCount: true,
  createdAt: true,
});
export const selectCommunityPostSchema = createSelectSchema(communityPostsTable);

export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;
export type CommunityPost = typeof communityPostsTable.$inferSelect;
