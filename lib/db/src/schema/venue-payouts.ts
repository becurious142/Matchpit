import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "batched",       // HM10 PATCH 7: Assigned to a settlement batch
  "processing",    // HM10 PATCH 7: Batch is being processed
  "paid",
  "hold",
  "ready_for_settlement",
]);

export const venuePayoutLedgerTable = pgTable("venue_payout_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venuesTable.id),
  referenceId: uuid("reference_id"),
  referenceType: text("reference_type").notNull(),
  grossAmount: numeric("gross_amount", { precision: 10, scale: 2 }).notNull(),
  razorpayFee: numeric("razorpay_fee", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  platformCommission: numeric("platform_commission", {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default("0"),
  venuePayable: numeric("venue_payable", { precision: 10, scale: 2 }).notNull(),
  // HM8: idempotency guard
  paymentId: uuid("payment_id"),
  payoutType: text("payout_type", {
    enum: ["host_commitment", "match_reserve", "match_final", "reversal"]
  }),
  status: payoutStatusEnum("status").notNull().default("pending"),
  // HM10 PATCH 7 — Batch membership locking.
  // Once assigned, this field is IMMUTABLE — a row can only belong to one batch.
  // Reversals must create NEW additive negative rows, never modify this field.
  settlementBatchId: uuid("settlement_batch_id"),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVenuePayoutSchema = createInsertSchema(
  venuePayoutLedgerTable,
).omit({
  id: true,
  createdAt: true,
});

export const selectVenuePayoutSchema = createSelectSchema(venuePayoutLedgerTable);

export type InsertVenuePayout = z.infer<typeof insertVenuePayoutSchema>;
export type VenuePayout = typeof venuePayoutLedgerTable.$inferSelect;
