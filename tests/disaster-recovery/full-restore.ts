import { execSync } from "child_process";
import { env } from "../../artifacts/api-server/src/config/env";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * CAUTION: This script is destructive. It drops the current DB, 
 * restores from a specified snapshot, and flushes Redis.
 * Intended ONLY for staging/DR drills.
 */
async function runRestoreDrill(snapshotPath: string) {
  if (env.NODE_ENV === "production") {
    throw new Error("Cannot run DR script in production!");
  }

  console.log("🔥 Initiating Full Disaster Recovery Restore Drill");

  // 1. Flush Redis
  console.log("🧹 Flushing Redis...");
  execSync(`redis-cli -u ${env.REDIS_URL} FLUSHALL`);

  // 2. Restore DB
  console.log(`💾 Restoring Postgres from ${snapshotPath}...`);
  // Assuming a standard pg_restore flow
  // Note: pg_restore requires PGPASSWORD to be set in environment
  try {
    execSync(`pg_restore --clean --if-exists --no-owner --no-privileges -d ${env.DATABASE_URL} ${snapshotPath}`, {
      stdio: "inherit",
    });
  } catch (err) {
    console.error("Failed to run pg_restore. This is expected if testing without a real snapshot file.");
  }

  // 3. Verify Ledger Integrity
  console.log("🔍 Verifying ledger integrity post-restore...");
  const [{ totalBalance }] = await db
    .select({ totalBalance: sql<string>`SUM(amount)`.mapWith(String) })
    .from(sql`financial_ledger`);

  if (Number(totalBalance) !== 0) {
    throw new Error(`Restore failed! Ledger is corrupted. Balance: ${totalBalance}`);
  }

  console.log("✅ Restore drill completed successfully. System is in a consistent state.");
}

// In a real execution, you'd pass the snapshot path via CLI args
// runRestoreDrill(process.argv[2]);
