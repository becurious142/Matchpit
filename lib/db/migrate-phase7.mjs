/**
 * Phase 7 Migration: Operations, Reconciliation & Admin Control Center
 *
 * Run: node --env-file=../../.env migrate-phase7.mjs
 *
 * Idempotent — safe to re-run at any time.
 *
 * Changes:
 *   cron_executions — CREATE new table
 *   indexes — CREATE performance indexes on operational tables
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

/** Execute SQL, ignoring "already exists" errors (idempotent). */
async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`✓ ${label}`);
  } catch (err) {
    if (["42P07", "42P16", "23505"].includes(err.code) || err.message.includes("already exists")) {
      console.log(`~ ${label} (already exists, skipped)`);
    } else {
      console.error(`✗ ${label}:`, err.message);
      throw err;
    }
  }
}

async function migrate() {
  await client.connect();
  console.log("Connected.\n=== Phase 7 Migration ===\n");

  // 1. cron_executions table
  await run(
    "CREATE TABLE: cron_executions",
    `CREATE TABLE IF NOT EXISTS cron_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_name TEXT NOT NULL,
      job_key TEXT NOT NULL,
      trigger_source TEXT NOT NULL DEFAULT 'cron',
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      duration_ms INTEGER,
      error_message TEXT,
      metadata JSONB DEFAULT '{}'
    )`
  );

  // 2. Indexes
  await run(
    "CREATE INDEX: idx_notification_dispatch_logs_created_at",
    `CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_created_at
     ON notification_dispatch_logs (created_at DESC)`
  );

  await run(
    "CREATE INDEX: idx_notification_dispatch_logs_status",
    `CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_status
     ON notification_dispatch_logs (status)`
  );

  await run(
    "CREATE INDEX: idx_reconciliation_reports_resolved",
    `CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_resolved
     ON reconciliation_reports (resolved)`
  );

  await run(
    "CREATE INDEX: idx_admin_audit_logs_timestamp",
    `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_timestamp
     ON admin_audit_logs (timestamp DESC)`
  );

  await run(
    "CREATE INDEX: idx_cron_executions_started_at",
    `CREATE INDEX IF NOT EXISTS idx_cron_executions_started_at
     ON cron_executions (started_at DESC)`
  );

  await client.end();
  console.log("\n✓ Phase 7 migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
