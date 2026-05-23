import { db, financialLedgerTable } from "@workspace/db";
import { sql } from "drizzle-orm";

type Account = typeof financialLedgerTable.$inferSelect.accountId;

interface LedgerEntry {
  accountId: Account;
  amount: number;
  type: "credit" | "debit";
}

interface RecordTransactionOptions {
  transactionId?: string; // If not provided, generates a new one
  entityId?: string;
  referenceType: string;
  referenceId: string;
  description: string;
  metadata?: Record<string, unknown>;
  tx?: any; // Drizzle transaction context
}

export class FinancialLedgerService {
  /**
   * Validates that the transaction adheres to double-entry principles (credits == debits)
   */
  private static validate(entries: LedgerEntry[]) {
    if (entries.length < 2) {
      throw new Error("A transaction must have at least two entries");
    }

    const totalCredits = entries
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + e.amount, 0);

    const totalDebits = entries
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + e.amount, 0);

    // Using epsilon to handle floating point precision issues if any, though amounts should be integers/cents ideally.
    if (Math.abs(totalCredits - totalDebits) > 0.01) {
      throw new Error(`Transaction unbalanced: credits (${totalCredits}) != debits (${totalDebits})`);
    }

    if (totalCredits <= 0) {
      throw new Error("Transaction amount must be strictly positive");
    }
  }

  /**
   * General-purpose transaction recorder.
   */
  static async recordTransaction(entries: LedgerEntry[], options: RecordTransactionOptions) {
    this.validate(entries);

    const transactionId = options.transactionId || crypto.randomUUID();
    const runner = options.tx || db;

    const values = entries.map((entry) => ({
      transactionId,
      accountId: entry.accountId,
      amount: entry.amount.toString(),
      type: entry.type,
      entityId: options.entityId,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      description: options.description,
      metadata: options.metadata || {},
    }));

    await runner.insert(financialLedgerTable).values(values);

    return transactionId;
  }

  /**
   * Transfers funds between two accounts.
   */
  static async transfer(
    fromAccount: Account,
    toAccount: Account,
    amount: number,
    options: RecordTransactionOptions
  ) {
    // Determine debits/credits based on normal account balances.
    // In accounting:
    // Assets & Expenses increase with Debit, decrease with Credit.
    // Liabilities, Equity, Revenue increase with Credit, decrease with Debit.
    // So moving money FROM a Liability/Revenue account is a Debit, TO it is a Credit.
    // Moving money FROM an Asset account is a Credit, TO it is a Debit.

    // A universal "transfer" without deep accounting rule mapping:
    // From is Debit (if liability/revenue) or Credit (if asset/expense)
    // To is Credit (if liability/revenue) or Debit (if asset/expense)
    
    // For simplicity, we just explicitly state debit/credit if the caller knows, 
    // or we define the rules:
    const isAssetExpense = (acc: Account) => acc.startsWith("asset_") || acc.startsWith("expense_");
    
    const fromType = isAssetExpense(fromAccount) ? "credit" : "debit";
    const toType = isAssetExpense(toAccount) ? "debit" : "credit";

    return this.recordTransaction(
      [
        { accountId: fromAccount, amount, type: fromType },
        { accountId: toAccount, amount, type: toType },
      ],
      options
    );
  }

  /**
   * Reverses an existing transaction exactly.
   */
  static async reverse(
    originalTransactionId: string,
    reason: string,
    tx?: any
  ) {
    const runner = tx || db;
    
    // 1. Fetch original entries
    const originalEntries = await runner
      .select()
      .from(financialLedgerTable)
      .where(sql`${financialLedgerTable.transactionId} = ${originalTransactionId}`);

    if (originalEntries.length === 0) {
      throw new Error(`Original transaction ${originalTransactionId} not found`);
    }

    // 2. Create reversing entries
    const reversalTransactionId = crypto.randomUUID();
    const values = originalEntries.map((entry: any) => ({
      transactionId: reversalTransactionId,
      accountId: entry.accountId,
      amount: entry.amount.toString(),
      // Reverse the debit/credit
      type: entry.type === "credit" ? "debit" : "credit",
      entityId: entry.entityId,
      referenceType: "reversal",
      referenceId: originalTransactionId, // Link back to the transaction being reversed
      description: `Reversal: ${reason}`,
      metadata: { originalReferenceType: entry.referenceType, originalReferenceId: entry.referenceId },
    }));

    await runner.insert(financialLedgerTable).values(values);

    return reversalTransactionId;
  }
}
