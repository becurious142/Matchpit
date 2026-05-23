import {
  pgTable,
  text,
  numeric,
  integer,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const paymentTypeEnum = pgEnum("payment_type", [
  "booking",
  "host_commitment",
  "match_reserve",
  "match_final",
  "match_join",   // Phase 2B: full upfront payment at join time
  "refund",
  "cashback",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "payment_initiated",
  "payment_authorized",
  "payment_captured",
  "verified",
  "success", // Keeping for backwards compat during transition
  "failed",
  "expired",
  "refunded",
  "partially_refunded",
]);

export const paymentReviewStatusEnum = pgEnum("payment_review_status", [
  "none",
  "refund_required",
  "refund_processing",
  "refunded",
  "reconciliation_required",
]);

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  type: paymentTypeEnum("type").notNull(),
  referenceId: uuid("reference_id"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpaySignature: text("razorpay_signature"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentCategory: text("payment_category", {
    enum: [
      "booking",
      "host_commitment",
      "match_reserve",
      "match_final",
      "match_join",   // Phase 2B
      "wallet",
      "refund"
    ]
  }),
  grossAmount: integer("gross_amount").default(0).notNull(),
  hostFeeComponent: integer("host_fee_component").default(0).notNull(),
  reserveFeeComponent: integer("reserve_fee_component").default(0).notNull(),
  finalFeeComponent: integer("final_fee_component").default(0).notNull(),
  walletComponent: integer("wallet_component").default(0).notNull(),
  refundComponent: integer("refund_component").default(0).notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  reviewStatus: paymentReviewStatusEnum("review_status").notNull().default("none"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPaymentSchema = createSelectSchema(paymentsTable);

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
