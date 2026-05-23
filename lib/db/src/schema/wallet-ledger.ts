import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

// ─── Backward-compat enum (Phase 2A) ─────────────────────────────────────────
// Kept so existing wallet.ts code compiles without changes.
export const ledgerTypeEnum = pgEnum("ledger_type", ["credit", "debit"]);

// ─── Phase 5 enum — full transaction taxonomy ─────────────────────────────────
export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "credit",
  "debit",
  "reward",
  "cashback",
  "referral_bonus",
  "refund",
  "refund_reversal",
  "reward_reversal",
  "wallet_redemption",
  "manual_adjustment",
  "expired",
]);

export type WalletTransactionType =
  (typeof walletTransactionTypeEnum.enumValues)[number];

// ─── wallet_ledger table ──────────────────────────────────────────────────────
export const walletLedgerTable = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),

    // Phase 5: balance snapshot for full audit trail
    balanceBefore: numeric("balance_before", { precision: 12, scale: 2 }),

    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),

    // Phase 2A legacy type column — kept for backward compat
    type: ledgerTypeEnum("type"),

    // Phase 5: rich transaction type
    transactionType: walletTransactionTypeEnum("transaction_type"),

    // Phase 2A legacy reason column — kept for backward compat
    reason: text("reason"),

    // Phase 5: structured reference
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),

    // Phase 5: human-readable description (aliases reason for new code)
    description: text("description"),

    // Phase 5: flexible metadata blob
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_wallet_ledger_user_created").on(table.userId, table.createdAt),
    index("idx_wallet_ledger_reference").on(
      table.referenceType,
      table.referenceId
    ),
  ]
);

export const insertWalletLedgerSchema = createInsertSchema(
  walletLedgerTable
).omit({
  id: true,
  createdAt: true,
});

export const selectWalletLedgerSchema = createSelectSchema(walletLedgerTable);

export type InsertWalletLedger = z.infer<typeof insertWalletLedgerSchema>;
export type WalletLedger = typeof walletLedgerTable.$inferSelect;
