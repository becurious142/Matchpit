/**
 * Phase 3 Migration: Attendance Verification Schema
 *
 * Run once: node --env-file=../../.env migrate-phase3.mjs
 *
 * Creates:
 *   - attendance_role enum
 *   - attendance_status enum
 *   - match_attendance_confirmations table
 *
 * Alters:
 *   - match_status enum  → adds 'pending_verification', 'disputed'
 *   - hosted_matches     → adds verification_deadline, settlement_releases_at columns
 *
 * All statements are idempotent (IF NOT EXISTS / DO NOTHING patterns).
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`✓ ${label}`);
  } catch (err) {
    if (err.code === "42710" || err.code === "42P07" || err.code === "42701") {
      // already exists — idempotent
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

  // ── Enums ──────────────────────────────────────────────────────────────────
  await run(
    "Create attendance_role enum",
    `CREATE TYPE attendance_role AS ENUM ('host', 'player')`
  );

  await run(
    "Create attendance_status enum",
    `CREATE TYPE attendance_status AS ENUM ('pending', 'confirmed', 'rejected')`
  );

  // ── match_status: add new values ───────────────────────────────────────────
  await run(
    "Add pending_verification to match_status",
    `ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'pending_verification' AFTER 'cancelled_underfilled'`
  );

  await run(
    "Add disputed to match_status",
    `ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'disputed' AFTER 'pending_verification'`
  );

  // ── hosted_matches: add new columns ────────────────────────────────────────
  await run(
    "Add verification_deadline to hosted_matches",
    `ALTER TABLE hosted_matches ADD COLUMN IF NOT EXISTS verification_deadline TIMESTAMP`
  );

  await run(
    "Add settlement_releases_at to hosted_matches",
    `ALTER TABLE hosted_matches ADD COLUMN IF NOT EXISTS settlement_releases_at TIMESTAMP`
  );

  // ── New table ──────────────────────────────────────────────────────────────
  await run(
    "Create match_attendance_confirmations table",
    `CREATE TABLE IF NOT EXISTS match_attendance_confirmations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES hosted_matches(id) ON DELETE CASCADE,
      participant_id UUID REFERENCES hosted_match_participants(id) ON DELETE SET NULL,
      user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role attendance_role NOT NULL,
      status attendance_status NOT NULL DEFAULT 'pending',
      confirmed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  );

  // ── Index for fast quorum lookups ─────────────────────────────────────────
  await run(
    "Index: match_attendance_confirmations(match_id, role, status)",
    `CREATE INDEX IF NOT EXISTS idx_mac_match_role_status
     ON match_attendance_confirmations(match_id, role, status)`
  );

  await run(
    "Index: match_attendance_confirmations(match_id, user_id)",
    `CREATE INDEX IF NOT EXISTS idx_mac_match_user
     ON match_attendance_confirmations(match_id, user_id)`
  );

  // ── Verify ─────────────────────────────────────────────────────────────────
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'match_attendance_confirmations'
     ORDER BY ordinal_position`
  );
  console.log("\n✓ match_attendance_confirmations columns:", rows.map(r => r.column_name).join(", "));

  const { rows: statusRows } = await client.query(
    `SELECT enum_range(NULL::match_status)`
  );
  console.log("✓ match_status enum:", statusRows[0].enum_range);

  await client.end();
  console.log("\n✓ Phase 3 migration complete.");
}

migrate().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
