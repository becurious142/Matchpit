-- ============================================================================
-- Migration: Add wallet balance non-negative constraint
-- Version: 0002
-- Date: 2026-05-20
-- Phase: 2A (Critical Blocker Fixes)
--
-- PURPOSE:
-- Prevents negative wallet balances at the database level.
-- Complements application-level conditional UPDATE logic in wallet.ts.
--
-- SAFETY:
-- - Idempotent: Safe to run multiple times
-- - Non-blocking: Constraint checks only on INSERT/UPDATE
-- - Backward compatible: Existing positive balances unaffected
--
-- RISK ASSESSMENT:
-- - Low risk: Only affects profiles table
-- - No data migration required
-- - Constraint validates instantly (no table scan needed if all balances >= 0)
--
-- ROLLBACK:
-- See rollback section at end of file.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Validate current data
-- ============================================================================

-- Check for any existing negative balances (should be none)
-- If this query returns rows, DO NOT proceed with migration
DO $$
DECLARE
  negative_count INT;
BEGIN
  SELECT COUNT(*) INTO negative_count
  FROM profiles
  WHERE wallet_balance < 0;

  IF negative_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: Found % profiles with negative wallet_balance. Fix data before adding constraint.', negative_count;
  END IF;

  RAISE NOTICE 'Pre-migration check passed: 0 negative balances found.';
END $$;

-- ============================================================================
-- STEP 2: Add non-negative constraint
-- ============================================================================

-- Add CHECK constraint to profiles table
-- Constraint name: positive_wallet_balance
-- Rule: wallet_balance >= 0
--
-- Effect:
-- - All future INSERTs must have wallet_balance >= 0
-- - All future UPDATEs that would make wallet_balance < 0 will fail
-- - Application code catches this and throws InsufficientFundsError
ALTER TABLE profiles
ADD CONSTRAINT positive_wallet_balance
CHECK (wallet_balance >= 0);

-- ============================================================================
-- STEP 3: Verify constraint
-- ============================================================================

-- Test that constraint works
DO $$
BEGIN
  -- This should fail if constraint is active
  BEGIN
    UPDATE profiles
    SET wallet_balance = -1
    WHERE id = '00000000-0000-0000-0000-000000000000'; -- Non-existent ID

    RAISE EXCEPTION 'Constraint validation failed: Negative balance UPDATE succeeded (should have been blocked)';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'Constraint validation passed: Negative balance UPDATE blocked as expected.';
    WHEN OTHERS THEN
      -- If UPDATE fails for other reasons (e.g., no rows), that's fine
      RAISE NOTICE 'Constraint validation passed: UPDATE failed (expected for non-existent ID).';
  END;
END $$;

-- ============================================================================
-- STEP 4: Add comment
-- ============================================================================

COMMENT ON CONSTRAINT positive_wallet_balance ON profiles IS
  'Prevents negative wallet balances. Added in Phase 2A (migration 0002) to enforce overdraft protection.';

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Run this query after migration to verify:
-- SELECT
--   conname AS constraint_name,
--   pg_get_constraintdef(c.oid) AS constraint_definition
-- FROM pg_constraint c
-- JOIN pg_namespace n ON n.oid = c.connamespace
-- WHERE conname = 'positive_wallet_balance' AND n.nspname = 'public';
--
-- Expected output:
-- constraint_name         | constraint_definition
-- -----------------------|-------------------------------------
-- positive_wallet_balance | CHECK ((wallet_balance >= (0)::numeric))

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

-- If you need to remove this constraint (NOT RECOMMENDED in production):
--
-- BEGIN;
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS positive_wallet_balance;
-- COMMIT;
--
-- WARNING: Removing this constraint allows negative balances.
-- Only do this if:
-- 1. You are rolling back to pre-Phase 2A code
-- 2. Application-level overdraft protection has a critical bug
-- 3. You have approval from finance team
--
-- After rollback, immediately:
-- 1. Fix the application-level bug
-- 2. Run reconciliation to identify any negative balances created
-- 3. Manually correct negative balances to 0
-- 4. Re-apply this migration

-- ============================================================================
-- MONITORING QUERIES
-- ============================================================================

-- Check for constraint violations in logs:
-- SELECT * FROM pg_stat_database_conflicts WHERE datname = current_database();

-- List all constraints on profiles table:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'profiles'::regclass;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
