import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dispatchChannelEnum = pgEnum("dispatch_channel", [
  "in_app",
  "whatsapp",
  "sms",
]);

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "queued",
  "sent",
  "failed",
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
