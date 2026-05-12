import {
  pgTable,
  text,
  jsonb,
  integer,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentWebhookEventsTable = pgTable("payment_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerEventId: text("provider_event_id").notNull().unique(),
  provider: text("provider").notNull().default("razorpay"),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  processingStatus: text("processing_status", {
    enum: ["pending", "processed", "failed", "ignored", "refund_required"],
  }).notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentWebhookEventSchema = createInsertSchema(paymentWebhookEventsTable).omit({
  id: true,
  createdAt: true,
});

export const selectPaymentWebhookEventSchema = createSelectSchema(paymentWebhookEventsTable);

export type InsertPaymentWebhookEvent = z.infer<typeof insertPaymentWebhookEventSchema>;
export type PaymentWebhookEvent = typeof paymentWebhookEventsTable.$inferSelect;
