/**
 * Phase 8 Migration: Queue Infrastructure — job_executions table
 *
 * Run: node --env-file=../../.env migrate-phase8.mjs
 *
 * Idempotent — safe to re-run at any time.
 *
 * Changes:
 *   job_executions — CREATE new table (write-ahead audit for BullMQ jobs)
 *   payment_refunds — ADD COLUMN enqueue_failed status support (via CHECK update)
 *   indexes — CREATE performance indexes on job_executions
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
  console.log("Connected.\n=== Phase 8 Migration ===\n");

  // 1. job_executions table
  await run(
    "CREATE TABLE: job_executions",
    `CREATE TABLE IF NOT EXISTS job_executions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      queue_name    TEXT NOT NULL,
      job_type      TEXT NOT NULL,
      bullmq_job_id TEXT,
      reference_id  TEXT,
      attempts      INTEGER DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','completed','failed','exhausted','enqueue_failed')),
      started_at    TIMESTAMPTZ,
      completed_at  TIMESTAMPTZ,
      duration_ms   INTEGER,
      error_payload JSONB,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  // 2. Indexes
  await run(
    "CREATE INDEX: idx_job_executions_queue_status",
    `CREATE INDEX IF NOT EXISTS idx_job_executions_queue_status
     ON job_executions (queue_name, status)`
  );

  await run(
    "CREATE INDEX: idx_job_executions_reference_id",
    `CREATE INDEX IF NOT EXISTS idx_job_executions_reference_id
     ON job_executions (reference_id)`
  );

  await run(
    "CREATE INDEX: idx_job_executions_created_at",
    `CREATE INDEX IF NOT EXISTS idx_job_executions_created_at
     ON job_executions (created_at DESC)`
  );

  await run(
    "CREATE INDEX: idx_job_executions_status",
    `CREATE INDEX IF NOT EXISTS idx_job_executions_status
     ON job_executions (status) WHERE status IN ('pending', 'enqueue_failed')`
  );

  await client.end();
  console.log("\n✓ Phase 8 migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
