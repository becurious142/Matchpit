import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  eventName: text("event_name").notNull(),
  meta: jsonb("meta").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAnalyticsEventSchema = createInsertSchema(
  analyticsEventsTable
).omit({ id: true, createdAt: true });

export const selectAnalyticsEventSchema = createSelectSchema(
  analyticsEventsTable
);

export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
