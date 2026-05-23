/**
 * Phase 2B Migration: Add 'match_join' to payment_type enum
 *
 * Run once: node --env-file=../../.env migrate-phase2b.mjs
 *           OR: node --env-file=.env migrate-phase2b.mjs
 *
 * PostgreSQL allows adding new values to an enum with ALTER TYPE ... ADD VALUE.
 * Using IF NOT EXISTS to make it idempotent (safe to re-run).
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log("Connected to database.");

  try {
    // Add match_join to payment_type enum
    await client.query(`ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'match_join' AFTER 'match_final';`);
    console.log("✓ Added 'match_join' to payment_type enum");

    // Verify
    const res = await client.query(`SELECT enum_range(NULL::payment_type);`);
    console.log("Current payment_type enum values:", res.rows[0].enum_range);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log("\n✓ Phase 2B migration complete.");
}

migrate();
