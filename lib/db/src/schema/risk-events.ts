import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskEventsTable = pgTable("risk_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"), // Nullable because some events might not be tied to a specific user yet
  eventType: text("event_type").notNull(),
  identitySignals: jsonb("identity_signals").notNull().default({}),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRiskEventSchema = createInsertSchema(riskEventsTable).omit({
  id: true,
  createdAt: true,
});

export const selectRiskEventSchema = createSelectSchema(riskEventsTable);

export type InsertRiskEvent = z.infer<typeof insertRiskEventSchema>;
export type RiskEvent = typeof riskEventsTable.$inferSelect;
