/**
 * Phase 5 Migration: Wallet, Rewards & Referral Engine
 *
 * Run: node --env-file=../../.env migrate-phase5.mjs
 *
 * Idempotent — safe to re-run at any time.
 *
 * Changes:
 *   wallet_ledger      — add Phase 5 columns + new enum
 *   reward_events      — extend enum + add lifecycle columns + dedup index
 *   referrals          — CREATE new table + enum
 *   reward_status      — CREATE new enum
 *   wallet_transaction_type — CREATE new enum
 *   referral_status    — CREATE new enum
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
    if (["42710", "42P07", "42701", "42P16", "23505"].includes(err.code)) {
      console.log(`~ ${label} (already exists, skipped)`);
    } else {
      console.error(`✗ ${label}:`, err.message);
      throw err;
    }
  }
}

async function migrate() {
  await client.connect();
  console.log("Connected.\n=== Phase 5 Migration ===\n");

  // ─── 1. New enums ────────────────────────────────────────────────────────────

  await run(
    "CREATE enum: wallet_transaction_type",
    `CREATE TYPE wallet_transaction_type AS ENUM (
      'credit', 'debit', 'reward', 'cashback', 'referral_bonus',
      'refund', 'refund_reversal', 'reward_reversal', 'wallet_redemption',
      'manual_adjustment', 'expired'
    )`
  );

  await run(
    "CREATE enum: reward_status",
    `CREATE TYPE reward_status AS ENUM ('pending', 'credited', 'reversed', 'expired')`
  );

  await run(
    "CREATE enum: referral_status",
    `CREATE TYPE referral_status AS ENUM (
      'pending', 'qualified', 'credited', 'reversed', 'expired'
    )`
  );

  // ─── 2. Extend existing reward_event_type enum ───────────────────────────────
  // Legacy values already exist; add Phase 5 values + host_milestone_reward

  for (const val of [
    "host_milestone_reward",
    "first_match_cashback",
    "milestone_reward",
    "referral_reward",
    "host_bonus",
    "manual_reward",
  ]) {
    await run(
      `ADD reward_event_type value: ${val}`,
      `ALTER TYPE reward_event_type ADD VALUE IF NOT EXISTS '${val}'`
    );
  }

  // ─── 3. wallet_ledger — new Phase 5 columns ──────────────────────────────────

  await run(
    "wallet_ledger: ADD COLUMN balance_before",
    `ALTER TABLE wallet_ledger
     ADD COLUMN IF NOT EXISTS balance_before NUMERIC(12,2)`
  );

  await run(
    "wallet_ledger: ADD COLUMN transaction_type",
    `ALTER TABLE wallet_ledger
     ADD COLUMN IF NOT EXISTS transaction_type wallet_transaction_type`
  );

  await run(
    "wallet_ledger: ADD COLUMN reference_type",
    `ALTER TABLE wallet_ledger
     ADD COLUMN IF NOT EXISTS reference_type TEXT`
  );

  await run(
    "wallet_ledger: ADD COLUMN description",
    `ALTER TABLE wallet_ledger
     ADD COLUMN IF NOT EXISTS description TEXT`
  );

  await run(
    "wallet_ledger: ADD COLUMN metadata",
    `ALTER TABLE wallet_ledger
     ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'`
  );

  await run(
    "wallet_ledger: INDEX idx_wallet_ledger_user_created",
    `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
     ON wallet_ledger(user_id, created_at DESC)`
  );

  await run(
    "wallet_ledger: INDEX idx_wallet_ledger_reference",
    `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference
     ON wallet_ledger(reference_type, reference_id)
     WHERE reference_id IS NOT NULL`
  );

  // ─── 4. reward_events — new Phase 5 columns ──────────────────────────────────

  await run(
    "reward_events: ADD COLUMN status",
    `ALTER TABLE reward_events
     ADD COLUMN IF NOT EXISTS status reward_status NOT NULL DEFAULT 'pending'`
  );

  await run(
    "reward_events: ADD COLUMN expires_at",
    `ALTER TABLE reward_events
     ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`
  );

  await run(
    "reward_events: ADD COLUMN processed_at",
    `ALTER TABLE reward_events
     ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP`
  );

  await run(
    "reward_events: ADD COLUMN reversed_at",
    `ALTER TABLE reward_events
     ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`
  );

  await run(
    "reward_events: ADD COLUMN metadata",
    `ALTER TABLE reward_events
     ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'`
  );

  await run(
    "reward_events: ADD COLUMN updated_at",
    `ALTER TABLE reward_events
     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`
  );

  // Idempotency index: (user_id, event_type, reference_id) WHERE reference_id IS NOT NULL
  await run(
    "reward_events: UNIQUE INDEX idx_reward_events_dedup",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_events_dedup
     ON reward_events(user_id, event_type, reference_id)
     WHERE reference_id IS NOT NULL`
  );

  await run(
    "reward_events: INDEX idx_reward_events_status",
    `CREATE INDEX IF NOT EXISTS idx_reward_events_status
     ON reward_events(status, expires_at)
     WHERE status IN ('pending', 'credited')`
  );

  // ─── 5. referrals — CREATE table ─────────────────────────────────────────────

  await run(
    "CREATE TABLE: referrals",
    `CREATE TABLE IF NOT EXISTS referrals (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      referred_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      referral_code   TEXT NOT NULL,
      status          referral_status NOT NULL DEFAULT 'pending',
      reward_amount   NUMERIC(12,2) NOT NULL DEFAULT 100,
      qualified_at    TIMESTAMP,
      credited_at     TIMESTAMP,
      reversed_at     TIMESTAMP,
      metadata        JSONB NOT NULL DEFAULT '{}',
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );

  await run(
    "referrals: UNIQUE INDEX on referred_user_id",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred_user
     ON referrals(referred_user_id)`
  );

  await run(
    "referrals: INDEX on referral_code",
    `CREATE INDEX IF NOT EXISTS idx_referrals_code
     ON referrals(referral_code)`
  );

  await run(
    "referrals: INDEX on referrer_user_id",
    `CREATE INDEX IF NOT EXISTS idx_referrals_referrer
     ON referrals(referrer_user_id)`
  );

  // ─── Verification ─────────────────────────────────────────────────────────────

  const { rows: wlCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'wallet_ledger' ORDER BY ordinal_position`
  );
  console.log("\n✓ wallet_ledger columns:", wlCols.map((r) => r.column_name).join(", "));

  const { rows: reCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'reward_events' ORDER BY ordinal_position`
  );
  console.log("✓ reward_events columns:", reCols.map((r) => r.column_name).join(", "));

  const { rows: refCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'referrals' ORDER BY ordinal_position`
  );
  console.log("✓ referrals columns:", refCols.map((r) => r.column_name).join(", "));

  await client.end();
  console.log("\n✓ Phase 5 migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
