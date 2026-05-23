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

// ─── Financial Accounts ───────────────────────────────────────────────────────
// In double-entry accounting, transactions always affect at least two accounts.
export const ledgerAccountEnum = pgEnum("ledger_account", [
  "asset_cash_razorpay",       // Money held in Razorpay
  "asset_cash_bank",           // Money settled to MATCHPIT bank account
  "liability_user_wallet",     // Money owed to users (wallet balances)
  "liability_host_payout",     // Money owed to hosts for matches
  "liability_venue_payout",    // Money owed to venues for bookings
  "revenue_platform_fees",     // Platform fees collected
  "revenue_host_fees",         // Fees collected from hosts
  "expense_payment_gateway",   // Razorpay fees
  "expense_cashback_rewards",  // Promotional wallet credits given
  "equity_retained_earnings",  // Retained earnings
]);

// ─── Financial Ledger ─────────────────────────────────────────────────────────
// Every transaction consists of multiple ledger entries (lines).
// The sum of credits must equal the sum of debits for a given transaction_id.
export const financialLedgerTable = pgTable(
  "financial_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").notNull(), // Groups entries
    accountId: ledgerAccountEnum("account_id").notNull(),
    
    // UUID of the specific entity (user, match, venue, etc)
    entityId: uuid("entity_id"),

    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: text("type", { enum: ["credit", "debit"] }).notNull(),

    // Structured reference to what caused this
    referenceType: text("reference_type").notNull(), // e.g. "payment", "refund", "match_payout"
    referenceId: uuid("reference_id").notNull(),
    
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_financial_ledger_transaction").on(table.transactionId),
    index("idx_financial_ledger_account").on(table.accountId),
    index("idx_financial_ledger_reference").on(table.referenceType, table.referenceId),
    index("idx_financial_ledger_entity").on(table.entityId),
  ]
);

export const insertFinancialLedgerSchema = createInsertSchema(financialLedgerTable).omit({
  id: true,
  createdAt: true,
});

export const selectFinancialLedgerSchema = createSelectSchema(financialLedgerTable);

export type InsertFinancialLedger = z.infer<typeof insertFinancialLedgerSchema>;
export type FinancialLedger = typeof financialLedgerTable.$inferSelect;
