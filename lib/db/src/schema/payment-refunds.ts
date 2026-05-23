import { pgTable, text, numeric, timestamp, uuid, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { paymentsTable } from "./payments";
import { profilesTable } from "./profiles";

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "processing",
  "gateway_processing",
  "wallet_completed",
  "gateway_completed",
  "partial_completed",
  "failed",
  "reversed",
]);

export const paymentRefundsTable = pgTable("payment_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => paymentsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  refundMode: text("refund_mode").notNull(), // 'wallet' | 'gateway' | 'hybrid'
  gatewayRefundAmount: numeric("gateway_refund_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  walletRefundAmount: numeric("wallet_refund_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  status: refundStatusEnum("status").notNull().default("pending"),
  providerRefundId: text("provider_refund_id"),
  providerResponse: jsonb("provider_response").default({}),
  failureReason: text("failure_reason"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
