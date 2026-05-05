import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportTargetTypeEnum = pgEnum("report_target_type", [
  "user",
  "post",
  "squad",
  "chat",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "reviewed",
  "dismissed",
  "actioned",
]);

export const userReportsTable = pgTable("user_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterUserId: uuid("reporter_user_id").notNull(),
  targetType: reportTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  status: reportStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserReportSchema = createInsertSchema(userReportsTable).omit(
  { id: true, createdAt: true }
);

export const selectUserReportSchema = createSelectSchema(userReportsTable);

export type InsertUserReport = z.infer<typeof insertUserReportSchema>;
export type UserReport = typeof userReportsTable.$inferSelect;
