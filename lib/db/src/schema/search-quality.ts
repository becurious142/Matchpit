import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const searchQualityEventsTable = pgTable("search_quality_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profilesTable.id, { onDelete: "set null" }),
  
  // The search query/params used
  query: text("query"),
  filters: jsonb("filters").$type<Record<string, unknown>>().default({}),
  
  // Results served
  resultsCount: numeric("results_count"),
  topResultIds: jsonb("top_result_ids").$type<string[]>().default([]),
  
  // Conversion tracking
  clickedEntityId: uuid("clicked_entity_id"),
  clickedPosition: numeric("clicked_position"), // rank 1, 2, 3...
  converted: timestamp("converted_at"), // set if the click resulted in a booking/join

  // Algorithm configuration at the time (for A/B testing)
  algoVersion: text("algo_version").notNull().default("v1"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSearchQualityEventSchema = createInsertSchema(searchQualityEventsTable).omit({
  id: true,
  createdAt: true,
});

export const selectSearchQualityEventSchema = createSelectSchema(searchQualityEventsTable);

export type InsertSearchQualityEvent = z.infer<typeof insertSearchQualityEventSchema>;
export type SearchQualityEvent = typeof searchQualityEventsTable.$inferSelect;
