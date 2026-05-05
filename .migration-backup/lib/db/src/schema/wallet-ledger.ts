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
import { profilesTable } from "./profiles";

export const ledgerTypeEnum = pgEnum("ledger_type", ["credit", "debit"]);

export const walletLedgerTable = pgTable("wallet_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  type: ledgerTypeEnum("type").notNull(),
  reason: text("reason").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 10, scale: 2 }).notNull(),
  referenceId: uuid("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWalletLedgerSchema = createInsertSchema(walletLedgerTable).omit({
  id: true,
  createdAt: true,
});

export const selectWalletLedgerSchema = createSelectSchema(walletLedgerTable);

export type InsertWalletLedger = z.infer<typeof insertWalletLedgerSchema>;
export type WalletLedger = typeof walletLedgerTable.$inferSelect;
