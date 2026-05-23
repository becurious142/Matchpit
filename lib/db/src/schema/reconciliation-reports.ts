import {
  pgTable,
  text,
  jsonb,
  boolean,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// HM10 PATCH 8 — Severity enum for operational priority triage
export const reconciliationSeverityEnum = pgEnum("reconciliation_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

// HM10 PATCH 9 — Report type enum covering all 5 orphan detection classes
export const reconciliationReportTypeEnum = pgEnum("reconciliation_report_type", [
  "orphan_payment_no_reservation",    // A: Captured payment, no reservation row
  "orphan_reservation_no_participant", // B: Reservation converted but no participant
  "orphan_participant_no_payout",      // C: Participant confirmed but no ledger entry
  "orphan_payout_no_payment",          // D: Payout row without a linked payment
  "refund_without_reversal",           // E: Refund processed, no reversal payout row
  "capture_mismatch",                  // Payout amount doesn't match payment amount
  "duplicate_webhook_attempt",         // Replay detected and blocked
  "settlement_batch_failure",          // Batch settlement error
  "late_webhook_refund_required",      // Late webhook flagged for manual refund
  "stale_pending_payment",             // Payment pending > threshold minutes
  "ledger_wallet_imbalance",           // Wallet total mismatch vs Ledger
  "ledger_razorpay_imbalance",         // Razorpay payments mismatch vs Ledger
]);

export const reconciliationReportsTable = pgTable("reconciliation_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  // HM10 PATCH 8: Full structured report with severity enum, sourceSystem, resolution tracking
  reportType: reconciliationReportTypeEnum("report_type").notNull(),
  severity: reconciliationSeverityEnum("severity").notNull().default("medium"),
  entityType: text("entity_type").notNull(), // "payment" | "reservation" | "participant" | "payout"
  entityId: uuid("entity_id"),              // ID of the offending entity
  sourceSystem: text("source_system").notNull().default("reconciliation_cron"), // Who detected this
  payload: jsonb("payload").notNull(),       // Raw JSON with full contextual data
  resolved: boolean("resolved").notNull().default(false),
  autoResolved: boolean("auto_resolved").notNull().default(false),
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReconciliationReportSchema = createInsertSchema(reconciliationReportsTable).omit({
  id: true,
  createdAt: true,
});

export const selectReconciliationReportSchema = createSelectSchema(reconciliationReportsTable);

export type InsertReconciliationReport = z.infer<typeof insertReconciliationReportSchema>;
export type ReconciliationReport = typeof reconciliationReportsTable.$inferSelect;
