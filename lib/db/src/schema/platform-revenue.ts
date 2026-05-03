import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformRevenueLedgerTable = pgTable("platform_revenue_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  referenceId: uuid("reference_id").notNull(),
  referenceType: text("reference_type").notNull(),
  grossAmount: numeric("gross_amount", { precision: 10, scale: 2 }).notNull(),
  gatewayFee: numeric("gateway_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull(),
  netRevenue: numeric("net_revenue", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlatformRevenueSchema = createInsertSchema(platformRevenueLedgerTable).omit({
  id: true,
  createdAt: true,
});

export const selectPlatformRevenueSchema = createSelectSchema(platformRevenueLedgerTable);

export type InsertPlatformRevenue = z.infer<typeof insertPlatformRevenueSchema>;
export type PlatformRevenue = typeof platformRevenueLedgerTable.$inferSelect;
