import { db, financialLedgerTable, profilesTable, paymentsTable, reconciliationReportsTable } from "@workspace/db";
import { sql, eq, sum, and, desc } from "@workspace/db";
import { logger } from "../lib/logger";

export class ReconciliationWorker {
  /**
   * Run full 3-way reconciliation:
   * 1. Wallet Balances vs Ledger (liability_user_wallet)
   * 2. Ledger Assets vs Razorpay success payments
   */
  static async runReconciliation() {
    logger.info("Starting 3-way financial reconciliation...");

    const anomalies: string[] = [];

    // --- 1. Wallet Balance vs Ledger ---
    // Calculate total wallet balance from profiles
    const [profileTotals] = await db
      .select({ total: sql<number>`SUM(wallet_balance)` })
      .from(profilesTable);
    
    const totalWalletBalance = Number(profileTotals?.total || 0);

    // Calculate total wallet liability from ledger
    // Liability accounts increase with Credit and decrease with Debit
    const [ledgerWalletTotals] = await db
      .select({
        credits: sql<number>`SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)`,
        debits: sql<number>`SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END)`
      })
      .from(financialLedgerTable)
      .where(eq(financialLedgerTable.accountId, "liability_user_wallet"));

    const ledgerCredits = Number(ledgerWalletTotals?.credits || 0);
    const ledgerDebits = Number(ledgerWalletTotals?.debits || 0);
    const ledgerWalletBalance = ledgerCredits - ledgerDebits;

    if (Math.abs(totalWalletBalance - ledgerWalletBalance) > 0.01) {
      const msg = `WALLET ANOMALY: Profiles Total (₹${totalWalletBalance}) != Ledger Total (₹${ledgerWalletBalance})`;
      logger.error(msg);
      anomalies.push(msg);
      await db.insert(reconciliationReportsTable).values({
        reportType: "ledger_wallet_imbalance",
        severity: "critical",
        entityType: "system",
        sourceSystem: "reconciliation_worker",
        payload: { totalWalletBalance, ledgerWalletBalance, msg }
      });
    }

    // --- 2. Razorpay Payments vs Ledger ---
    // Total successful payments in paymentsTable
    const [paymentTotals] = await db
      .select({ total: sql<number>`SUM(amount::numeric)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "success"));

    const totalSuccessfulPayments = Number(paymentTotals?.total || 0);

    // Asset accounts increase with Debit and decrease with Credit
    const [ledgerRazorpayTotals] = await db
      .select({
        credits: sql<number>`SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)`,
        debits: sql<number>`SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END)`
      })
      .from(financialLedgerTable)
      .where(eq(financialLedgerTable.accountId, "asset_cash_razorpay"));

    const ledgerRazorpayInflows = Number(ledgerRazorpayTotals?.debits || 0);

    if (Math.abs(totalSuccessfulPayments - ledgerRazorpayInflows) > 0.01) {
      const msg = `RAZORPAY ANOMALY: DB Payments Total (₹${totalSuccessfulPayments}) != Ledger Inflows (₹${ledgerRazorpayInflows})`;
      logger.error(msg);
      anomalies.push(msg);
      await db.insert(reconciliationReportsTable).values({
        reportType: "ledger_razorpay_imbalance",
        severity: "critical",
        entityType: "system",
        sourceSystem: "reconciliation_worker",
        payload: { totalSuccessfulPayments, ledgerRazorpayInflows, msg }
      });
    }

    // Return true if zero anomalies
    if (anomalies.length === 0) {
      logger.info("Reconciliation complete. System is perfectly balanced.");
      return { success: true, anomalies: [] };
    } else {
      logger.error({ anomalies }, "Reconciliation complete. Anomalies detected!");
      return { success: false, anomalies };
    }
  }
}
