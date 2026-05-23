import {
  pgTable,
  uuid,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Unified Social Graph Edges table
 * As per Phase 18 constraints, this table centrally manages all relationship edges
 * (e.g., USER -> TEAM_MEMBER -> TEAM, USER -> FRIEND -> USER)
 */
export const socialGraphEdgesTable = pgTable("social_graph_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // The origin of the edge (e.g. User A)
  sourceId: uuid("source_id").notNull(),
  sourceType: text("source_type", { enum: ["user", "team", "club", "venue"] }).notNull(),
  
  // The relationship type
  edgeType: text("edge_type", { 
    enum: [
      "friend",           // user -> user
      "played_with",      // user -> user (inferred from matches)
      "team_member",      // user -> team
      "club_member",      // user -> club
      "follows_club",     // user -> club
      "follows_venue"     // user -> venue
    ] 
  }).notNull(),
  
  // The destination of the edge (e.g. User B, Team X, Club Y)
  targetId: uuid("target_id").notNull(),
  targetType: text("target_type", { enum: ["user", "team", "club", "venue"] }).notNull(),

  // Optional contextual metadata (e.g. role in a team: 'captain', 'member')
  metadata: text("metadata"), 

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_social_graph_unique_edge").on(table.sourceId, table.edgeType, table.targetId),
]);

export const insertSocialGraphEdgeSchema = createInsertSchema(socialGraphEdgesTable);
export const selectSocialGraphEdgeSchema = createSelectSchema(socialGraphEdgesTable);

export type InsertSocialGraphEdge = z.infer<typeof insertSocialGraphEdgeSchema>;
export type SocialGraphEdge = typeof socialGraphEdgesTable.$inferSelect;
