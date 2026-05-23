/**
 * Phase 6 Migration: Advanced Refunds, Slack Throttling, and Settlement Batching
 *
 * Run: node --env-file=../../.env migrate-phase6.mjs
 *
 * Idempotent — safe to re-run at any time.
 *
 * Changes:
 *   refund_status      — CREATE new enum
 *   payment_refunds    — CREATE new table
 *   settlement_batches — CREATE new table
 *   admin_audit_logs   — CREATE new table
 *   payout_status      — Extend enum with 'batched', 'processing', 'ready_for_settlement' (if not exists)
 *   venue_payout_ledger— Add settlement_batch_id foreign key
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
    // PG error codes for "already exists" conditions
    if (["42710", "42P07", "42701", "42P16", "23505", "42704"].includes(err.code) || err.message.includes("already exists")) {
      console.log(`~ ${label} (already exists, skipped)`);
    } else {
      console.error(`✗ ${label}:`, err.message);
      throw err;
    }
  }
}

async function migrate() {
  await client.connect();
  console.log("Connected.\n=== Phase 6 Migration ===\n");

  // ─── 1. New enums ────────────────────────────────────────────────────────────

  await run(
    "CREATE enum: refund_status",
    `CREATE TYPE refund_status AS ENUM (
      'pending', 'processing', 'gateway_processing',
      'wallet_completed', 'gateway_completed', 'partial_completed',
      'failed', 'reversed'
    )`
  );

  // ─── 2. Extend existing payout_status enum ───────────────────────────────────

  for (const val of ["batched", "processing", "ready_for_settlement"]) {
    await run(
      `ADD payout_status value: ${val}`,
      `ALTER TYPE payout_status ADD VALUE IF NOT EXISTS '${val}'`
    );
  }

  // ─── 3. payment_refunds — CREATE table ───────────────────────────────────────

  await run(
    "CREATE TABLE: payment_refunds",
    `CREATE TABLE IF NOT EXISTS payment_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      refund_mode TEXT NOT NULL,
      gateway_refund_amount NUMERIC(10,2) NOT NULL DEFAULT '0.00',
      wallet_refund_amount NUMERIC(10,2) NOT NULL DEFAULT '0.00',
      status refund_status NOT NULL DEFAULT 'pending',
      provider_refund_id TEXT,
      provider_response JSONB DEFAULT '{}',
      failure_reason TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );

  // ─── 4. settlement_batches — CREATE table ────────────────────────────────────

  await run(
    "CREATE TABLE: settlement_batches",
    `CREATE TABLE IF NOT EXISTS settlement_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      total_amount NUMERIC(10,2) NOT NULL DEFAULT '0.00',
      total_payouts INTEGER NOT NULL DEFAULT 0,
      created_by UUID REFERENCES profiles(id),
      processed_at TIMESTAMP,
      settled_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );

  // ─── 5. admin_audit_logs — CREATE table ──────────────────────────────────────

  await run(
    "CREATE TABLE: admin_audit_logs",
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID NOT NULL REFERENCES profiles(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id UUID,
      payload JSONB DEFAULT '{}',
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );

  // ─── 6. venue_payout_ledger — add settlement_batch_id ────────────────────────

  await run(
    "venue_payout_ledger: ADD COLUMN settlement_batch_id",
    `ALTER TABLE venue_payout_ledger
     ADD COLUMN IF NOT EXISTS settlement_batch_id UUID REFERENCES settlement_batches(id)`
  );

  // ─── Verification ─────────────────────────────────────────────────────────────

  const { rows: prCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'payment_refunds' ORDER BY ordinal_position`
  );
  console.log("\n✓ payment_refunds columns:", prCols.map((r) => r.column_name).join(", "));

  const { rows: sbCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'settlement_batches' ORDER BY ordinal_position`
  );
  console.log("✓ settlement_batches columns:", sbCols.map((r) => r.column_name).join(", "));

  const { rows: aalCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'admin_audit_logs' ORDER BY ordinal_position`
  );
  console.log("✓ admin_audit_logs columns:", aalCols.map((r) => r.column_name).join(", "));

  const { rows: vplCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'venue_payout_ledger' AND column_name = 'settlement_batch_id'`
  );
  if (vplCols.length > 0) {
    console.log("✓ venue_payout_ledger: settlement_batch_id column exists.");
  }

  await client.end();
  console.log("\n✓ Phase 6 migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
