import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fraudFlagEntityTypeEnum = pgEnum("fraud_flag_entity_type", [
  "user",
  "match",
  "payout",
  "referral",
]);

export const fraudFlagSeverityEnum = pgEnum("fraud_flag_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const fraudFlagStatusEnum = pgEnum("fraud_flag_status", [
  "open",
  "resolved",
  "dismissed",
]);

export const fraudFlagsTable = pgTable("fraud_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: fraudFlagEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  severity: fraudFlagSeverityEnum("severity").notNull(),
  reason: text("reason").notNull(),
  score: integer("score").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  status: fraudFlagStatusEnum("status").notNull().default("open"),
  reviewedBy: uuid("reviewed_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFraudFlagSchema = createInsertSchema(fraudFlagsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectFraudFlagSchema = createSelectSchema(fraudFlagsTable);

export type InsertFraudFlag = z.infer<typeof insertFraudFlagSchema>;
export type FraudFlag = typeof fraudFlagsTable.$inferSelect;
