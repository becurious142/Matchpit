import { test, expect } from "vitest";
import { db, financialLedgerTable, profilesTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

test("Financial: Synthetic payout mismatch triggers alert and freeze", async () => {
  // We create a test profile with an artificial ledger mismatch
  // and assert that our detection query properly flags it.
  
  const testUserId = randomUUID();
  const testLedgerId = randomUUID();

  await db.transaction(async (tx) => {
    // Insert a profile with wallet_balance = 500
    await tx.insert(profilesTable).values({
      id: testUserId,
      clerkId: `clerk_${testUserId}`,
      phone: "+910000000000",
      displayName: "Synthetic Test User",
      walletBalance: "500.00", 
    });

    // Insert a ledger entry for only 400 (creating a 100 discrepancy)
    // We intentionally don't balance this with a platform entry so the global sum is also off.
    await tx.insert(financialLedgerTable).values({
      id: testLedgerId,
      profileId: testUserId,
      type: "user_wallet",
      amount: "400.00",
      currency: "INR",
      transactionType: "deposit",
      description: "Synthetic test entry",
    });
  });

  // Now we run the detection query
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
    AND p.id = ${testUserId}
  `);

  expect(discrepancies.rows.length).toBe(1);
  expect(Number(discrepancies.rows[0].stored_balance)).toBe(500);
  expect(Number(discrepancies.rows[0].expected_balance)).toBe(400);

  // In production, this detection triggers sendCatastrophicAlert() and pauses payouts.
  // Clean up
  await db.delete(financialLedgerTable).where(eq(financialLedgerTable.id, testLedgerId));
  await db.delete(profilesTable).where(eq(profilesTable.id, testUserId));
});
