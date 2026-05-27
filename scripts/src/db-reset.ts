/**
 * Wipes all application data from the public schema (keeps tables/migrations).
 * Run before seed for a clean slate.
 *
 * Usage: DATABASE_URL=... pnpm --filter @workspace/scripts db:reset
 */
import { sql } from "drizzle-orm";
import { db, closePool } from "@workspace/db";
import { requireDatabaseUrl } from "./load-env.js";

async function main() {
  requireDatabaseUrl();

  const confirm = process.env.CONFIRM_DB_RESET === "yes";
  if (!confirm) {
    console.error(
      "⚠️  This deletes ALL rows in public tables.\n" +
        "   Re-run with: CONFIRM_DB_RESET=yes pnpm --filter @workspace/scripts db:reset",
    );
    process.exit(1);
  }

  console.log("🗑️  Truncating all public tables (CASCADE)...\n");

  await db.execute(sql`
    DO $$
    DECLARE
      tables TEXT;
    BEGIN
      SELECT string_agg(quote_ident(tablename), ', ')
      INTO tables
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT IN ('spatial_ref_sys');

      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);

  console.log("✅  Database cleared.\n");
  await closePool();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Reset failed:", err);
  await closePool();
  process.exit(1);
});
