/**
 * Phase 4 Migration: Notification System
 *
 * Run once: node --env-file=../../.env migrate-phase4.mjs
 *
 * Alters:
 *   - dispatch_channel enum → adds 'email'
 *   - notification_dispatch_logs → adds retry/idempotency/audit columns
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL not set"); process.exit(1); }

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`✓ ${label}`);
  } catch (err) {
    if (["42710","42P07","42701","42P16"].includes(err.code)) {
      console.log(`~ ${label} (already exists, skipped)`);
    } else {
      console.error(`✗ ${label}:`, err.message);
      throw err;
    }
  }
}

async function migrate() {
  await client.connect();
  console.log("Connected.\n");

  await run(
    "Add email to dispatch_channel enum",
    `ALTER TYPE dispatch_channel ADD VALUE IF NOT EXISTS 'email' AFTER 'sms'`
  );

  await run(
    "Add retry_count to notification_dispatch_logs",
    `ALTER TABLE notification_dispatch_logs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`
  );

  await run(
    "Add last_error to notification_dispatch_logs",
    `ALTER TABLE notification_dispatch_logs ADD COLUMN IF NOT EXISTS last_error TEXT`
  );

  await run(
    "Add sent_at to notification_dispatch_logs",
    `ALTER TABLE notification_dispatch_logs ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP`
  );

  await run(
    "Add updated_at to notification_dispatch_logs",
    `ALTER TABLE notification_dispatch_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`
  );

  await run(
    "Add idempotency_key to notification_dispatch_logs",
    `ALTER TABLE notification_dispatch_logs ADD COLUMN IF NOT EXISTS idempotency_key TEXT`
  );

  await run(
    "Index: idempotency_key for dedup lookups",
    `CREATE INDEX IF NOT EXISTS idx_ndl_idempotency ON notification_dispatch_logs(idempotency_key) WHERE idempotency_key IS NOT NULL`
  );

  await run(
    "Index: status + retry_count for retry queue",
    `CREATE INDEX IF NOT EXISTS idx_ndl_retry ON notification_dispatch_logs(status, retry_count) WHERE status = 'failed'`
  );

  // Verify
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'notification_dispatch_logs'
     ORDER BY ordinal_position`
  );
  console.log("\n✓ notification_dispatch_logs columns:", rows.map(r => r.column_name).join(", "));

  const { rows: enumRows } = await client.query(`SELECT enum_range(NULL::dispatch_channel)`);
  console.log("✓ dispatch_channel enum:", enumRows[0].enum_range);

  await client.end();
  console.log("\n✓ Phase 4 migration complete.");
}

migrate().catch(err => { console.error("Migration failed:", err.message); process.exit(1); });
