import { db, financialLedgerTable, profilesTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

async function main() {
  console.log("🔍 Running Ledger Integrity Check...");

  // 1. Verify Global Ledger Balance = 0 (Double-entry accounting principle)
  const [{ totalBalance }] = await db
    .select({
      totalBalance: sql<string>`SUM(${financialLedgerTable.amount})`.mapWith(String),
    })
    .from(financialLedgerTable);

  if (Number(totalBalance) !== 0) {
    console.error(`🚨 CATASTROPHIC FAILURE: Global ledger balance is NOT zero! Difference: ${totalBalance}`);
    process.exit(1);
  } else {
    console.log("✅ Global ledger balances to exactly 0.00.");
  }

  // 2. Verify all user wallet balances match their ledger sum
  const discrepancies = await db.execute(sql`
    WITH ledger_sums AS (
      SELECT 
        profile_id, 
        SUM(amount) as calculated_balance
      FROM ${financialLedgerTable}
      WHERE type = 'user_wallet'
      GROUP BY profile_id
    )
    SELECT 
      p.id, 
      p.wallet_balance as stored_balance, 
      COALESCE(ls.calculated_balance, 0) as expected_balance
    FROM ${profilesTable} p
    LEFT JOIN ledger_sums ls ON p.id = ls.profile_id
    WHERE p.wallet_balance != COALESCE(ls.calculated_balance, 0)
  `);

  if (discrepancies.rows.length > 0) {
    console.error(`🚨 CATASTROPHIC FAILURE: Found ${discrepancies.rows.length} profile(s) with mismatched wallet balances!`);
    console.table(discrepancies.rows);
    process.exit(1);
  } else {
    console.log("✅ All user wallet balances match their exact ledger sum.");
  }

  console.log("🎉 Ledger Integrity Check Passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Integrity check failed:", err);
  process.exit(1);
});
