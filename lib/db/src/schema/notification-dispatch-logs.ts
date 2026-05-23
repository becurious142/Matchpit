import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dispatchChannelEnum = pgEnum("dispatch_channel", [
  "in_app",
  "whatsapp",
  "sms",
  "email",  // Phase 4
]);

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "queued",
  "sent",
  "failed",
  "exhausted", // Phase 8
]);

export const notificationDispatchLogsTable = pgTable(
  "notification_dispatch_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    notificationId: uuid("notification_id"),
    channel: dispatchChannelEnum("channel").notNull(),
    destination: text("destination").notNull(),
    templateKey: text("template_key").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: dispatchStatusEnum("status").notNull().default("queued"),
    // Phase 4: retry tracking
    retryCount: integer("retry_count").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // Phase 4: deduplication key = hash(userId+templateKey+channel+referenceId)
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  }
);

export const insertDispatchLogSchema = createInsertSchema(
  notificationDispatchLogsTable
).omit({ id: true, createdAt: true });

export const selectDispatchLogSchema = createSelectSchema(
  notificationDispatchLogsTable
);

export type InsertDispatchLog = z.infer<typeof insertDispatchLogSchema>;
export type DispatchLog = typeof notificationDispatchLogsTable.$inferSelect;
