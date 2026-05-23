import { env } from "../config/env";
/**
 * Central financial constants module for MATCHPIT.
 *
 * All financial calculations MUST import values from this module.
 * No subsystem may hardcode these values.
 *
 * Version: 2.1 (Phase 2B - Full Upfront Payment Model)
 * Date: 2026-05-20
 *
 * APPROVED BUSINESS MODEL:
 * - Platform commission: 15% (up from 12%)
 * - Host fee tiers: ₹0 → ₹29 → ₹39 → ₹49 based on completed hosted matches
 * - Milestone rewards: Reduced by ~40% for sustainability
 * - Refund routing: <₹500 wallet, ≥₹500 source
 *
 * PHASE 2B:
 * - ENABLE_UPFRONT_MODEL: When true, players pay the full match fee upfront
 *   (reserve + final combined) in a single 'match_join' payment.
 *   The legacy two-step reserve → final flow is preserved for backward
 *   compatibility and can be activated by setting the flag to false.
 */

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION & FEES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Platform commission rate applied to gross venue cost (%).
 *
 * Example: ₹1,000 venue cost → ₹150 platform commission (15%)
 *
 * @constant
 */
export const PLATFORM_COMMISSION_PERCENT = 15;

/**
 * Razorpay gateway fee rate applied to gross payment amount (%).
 *
 * Note: This is charged by Razorpay, NOT retained by platform.
 *
 * @constant
 */
export const GATEWAY_FEE_PERCENT = 2;

/**
 * Host convenience fee tiers based on completed hosted match count.
 *
 * Tier logic:
 * - Matches 0-2 (first 3): ₹0 (acquisition incentive)
 * - Matches 3-8: ₹29
 * - Matches 9-23: ₹39
 * - Matches 24+: ₹49
 *
 * Design rationale:
 * - First 3 matches free to reduce barrier to entry
 * - Gradual tier increases reward loyalty
 * - Top tier (₹49) only applies to power users (24+ matches)
 *
 * @constant
 */
export const HOST_FEE_TIERS = {
  tier0: { minMatches: 0, maxMatches: 2, fee: 0 },
  tier1: { minMatches: 3, maxMatches: 8, fee: 29 },
  tier2: { minMatches: 9, maxMatches: 23, fee: 39 },
  tier3: { minMatches: 24, maxMatches: Infinity, fee: 49 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// MILESTONE REWARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wallet cashback amounts for host milestone achievements (₹).
 *
 * Milestone thresholds → one-time wallet credit.
 *
 * Business rationale:
 * - Reduced by ~40% from original model for sustainability
 * - Total at 100 matches: ₹1,925 (was ₹3,850)
 * - Effective subsidy: ~2% of cumulative GMV (was 4%)
 *
 * Payment timeline:
 * - Credited immediately after match transitions to 'completed' status
 * - Idempotent: same milestone never paid twice
 *
 * @constant
 */
export const HOST_MILESTONE_REWARDS: Record<number, number> = {
  1: 25,    // First completed match
  5: 50,    // Fifth completed match
  10: 100,  // Tenth completed match
  25: 250,  // Twenty-fifth completed match
  50: 500,  // Fiftieth completed match
  100: 1000, // Hundredth completed match
};

// ═══════════════════════════════════════════════════════════════════════════
// REFUND POLICY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimum refund amount (₹) to trigger refund to original payment source.
 *
 * Routing logic:
 * - Amount < ₹500 → Wallet credit (avoid gateway refund fees)
 * - Amount ≥ ₹500 → Refund to source (UPI/card/etc)
 *
 * Rationale:
 * - Gateway refund fees: ₹3-5 per transaction
 * - Small refunds: wallet is cost-effective
 * - Large refunds: users expect money back to source (Indian consumer expectation)
 *
 * @constant
 */
export const REFUND_SOURCE_THRESHOLD = 500;

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Grace period (hours) after match end time for attendance verification.
 *
 * Workflow:
 * - Match ends → 48-hour window opens
 * - Host + players must confirm attendance within window
 * - If no confirmation → manual review queue
 *
 * @constant
 */
export const ATTENDANCE_VERIFICATION_GRACE_HOURS = 48;

/**
 * Minimum number of player confirmations required for match completion.
 *
 * Quorum rule:
 * - Require: Host confirmation + MAX(2 players, 50% of participants)
 * - Example: 10-player match → Host + 5 players
 * - Example: 4-player match → Host + 2 players
 *
 * @constant
 */
export const MIN_PLAYER_CONFIRMATIONS = 2;

/**
 * Settlement hold period (hours) after attendance verification.
 *
 * Purpose: Dispute resolution window.
 *
 * Timeline:
 * - Attendance verified → 24-hour hold
 * - After 24h → Payout status: ready_for_settlement
 * - Venue receives payment in next batch
 *
 * @constant
 */
export const SETTLEMENT_HOLD_HOURS = 24;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate platform commission from gross venue cost.
 *
 * Formula:
 * platformCommission = venueCost × (PLATFORM_COMMISSION_PERCENT / 100)
 *
 * Example:
 * venueCost = ₹2,000
 * commission = ₹2,000 × 0.15 = ₹300
 *
 * @param venueCost - Gross venue cost in rupees (before fees)
 * @returns Platform commission amount (₹)
 */
export function calculatePlatformCommission(venueCost: number): number {
  return Math.round((venueCost * (PLATFORM_COMMISSION_PERCENT / 100)) * 100) / 100;
}

/**
 * Calculate gateway fee from gross payment amount.
 *
 * Formula:
 * gatewayFee = grossAmount × (GATEWAY_FEE_PERCENT / 100)
 *
 * Note: This fee is charged by Razorpay, not retained by platform.
 *
 * @param grossAmount - Gross payment amount in rupees
 * @returns Gateway fee amount (₹)
 */
export function calculateGatewayFee(grossAmount: number): number {
  return Math.round((grossAmount * (GATEWAY_FEE_PERCENT / 100)) * 100) / 100;
}

/**
 * Get host convenience fee based on completed hosted match count.
 *
 * Tier determination:
 * - 0-2 completed matches → ₹0
 * - 3-8 completed matches → ₹29
 * - 9-23 completed matches → ₹39
 * - 24+ completed matches → ₹49
 *
 * @param completedHostedCount - Number of matches user has completed as host
 * @returns Host convenience fee (₹)
 *
 * @example
 * getHostFee(0)  // returns 0  (first match)
 * getHostFee(2)  // returns 0  (third match)
 * getHostFee(3)  // returns 29 (fourth match)
 * getHostFee(10) // returns 39
 * getHostFee(30) // returns 49
 */
export function getHostFee(completedHostedCount: number): number {
  if (completedHostedCount <= HOST_FEE_TIERS.tier0.maxMatches) {
    return HOST_FEE_TIERS.tier0.fee;
  }
  if (completedHostedCount <= HOST_FEE_TIERS.tier1.maxMatches) {
    return HOST_FEE_TIERS.tier1.fee;
  }
  if (completedHostedCount <= HOST_FEE_TIERS.tier2.maxMatches) {
    return HOST_FEE_TIERS.tier2.fee;
  }
  return HOST_FEE_TIERS.tier3.fee;
}

/**
 * Get milestone reward amount for a given milestone threshold.
 *
 * Returns the wallet credit amount (₹) for completing N hosted matches.
 * Returns 0 if no milestone exists at that threshold.
 *
 * @param milestoneCount - Completed hosted match count milestone
 * @returns Reward amount (₹) or 0 if no milestone
 *
 * @example
 * getMilestoneReward(1)   // returns 25
 * getMilestoneReward(5)   // returns 50
 * getMilestoneReward(10)  // returns 100
 * getMilestoneReward(7)   // returns 0 (no milestone)
 */
export function getMilestoneReward(milestoneCount: number): number {
  return HOST_MILESTONE_REWARDS[milestoneCount] ?? 0;
}

/**
 * Get all milestone thresholds in ascending order.
 *
 * Useful for:
 * - Iterating through milestones to check eligibility
 * - Displaying milestone progress to users
 * - Backfilling missing milestones
 *
 * @returns Array of milestone thresholds [1, 5, 10, 25, 50, 100]
 *
 * @example
 * getAllMilestones() // [1, 5, 10, 25, 50, 100]
 */
export function getAllMilestones(): number[] {
  return Object.keys(HOST_MILESTONE_REWARDS)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Check if a given count represents a milestone threshold.
 *
 * @param count - Completed hosted match count
 * @returns True if count is a milestone threshold
 *
 * @example
 * isMilestone(1)  // true
 * isMilestone(5)  // true
 * isMilestone(7)  // false
 */
export function isMilestone(count: number): boolean {
  return count in HOST_MILESTONE_REWARDS;
}

/**
 * Calculate total milestone rewards earned up to a given count.
 *
 * Useful for:
 * - Displaying cumulative rewards to users
 * - Financial reporting (total subsidy per cohort)
 *
 * @param completedHostedCount - Current completed hosted match count
 * @returns Total rewards earned (₹)
 *
 * @example
 * getTotalMilestoneRewardsEarned(0)   // 0
 * getTotalMilestoneRewardsEarned(1)   // 25
 * getTotalMilestoneRewardsEarned(10)  // 25+50+100 = 175
 * getTotalMilestoneRewardsEarned(100) // 1925
 */
export function getTotalMilestoneRewardsEarned(completedHostedCount: number): number {
  return getAllMilestones()
    .filter((threshold) => threshold <= completedHostedCount)
    .reduce((sum, threshold) => sum + HOST_MILESTONE_REWARDS[threshold], 0);
}

/**
 * Get next milestone threshold and reward for a given count.
 *
 * Returns null if user has achieved all milestones.
 *
 * @param completedHostedCount - Current completed hosted match count
 * @returns Next milestone info or null
 *
 * @example
 * getNextMilestone(0)  // { threshold: 1, reward: 25, matchesRemaining: 1 }
 * getNextMilestone(1)  // { threshold: 5, reward: 50, matchesRemaining: 4 }
 * getNextMilestone(7)  // { threshold: 10, reward: 100, matchesRemaining: 3 }
 * getNextMilestone(100) // null (all milestones achieved)
 */
export function getNextMilestone(
  completedHostedCount: number
): { threshold: number; reward: number; matchesRemaining: number } | null {
  const nextThreshold = getAllMilestones().find((t) => t > completedHostedCount);
  if (!nextThreshold) return null;

  return {
    threshold: nextThreshold,
    reward: HOST_MILESTONE_REWARDS[nextThreshold],
    matchesRemaining: nextThreshold - completedHostedCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL CALCULATION FORMULAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete payout calculation breakdown.
 *
 * Double-entry accounting:
 * 1. Gateway fee deducted first (Razorpay keeps this)
 * 2. Platform commission calculated on net (after gateway)
 * 3. Venue receives remainder
 *
 * Formula:
 * gatewayFee = grossAmount × 2%
 * platformCommission = (grossAmount - gatewayFee) × 15%
 * venuePayable = grossAmount - gatewayFee - platformCommission
 * netRevenue = platformCommission (NOT platformCommission - gatewayFee)
 *
 * @param grossAmount - Total payment amount (₹)
 * @returns Payout breakdown
 *
 * @example
 * calculatePayoutBreakdown(1000)
 * // {
 * //   grossAmount: 1000,
 * //   gatewayFee: 20,
 * //   platformCommission: 147,
 * //   venuePayable: 833,
 * //   netRevenue: 147
 * // }
 */
export interface PayoutBreakdown {
  grossAmount: number;
  gatewayFee: number;
  platformCommission: number;
  venuePayable: number;
  netRevenue: number;
}

export function calculatePayoutBreakdown(grossAmount: number): PayoutBreakdown {
  const gatewayFee = calculateGatewayFee(grossAmount);
  const netAfterGateway = grossAmount - gatewayFee;
  const platformCommission = calculatePlatformCommission(netAfterGateway);
  const venuePayable = Math.round((netAfterGateway - platformCommission) * 100) / 100;

  // CRITICAL: netRevenue = platformCommission (gateway already deducted)
  // DO NOT subtract gatewayFee again (that was the bug in v1.0)
  const netRevenue = platformCommission;

  return {
    grossAmount: Math.round(grossAmount * 100) / 100,
    gatewayFee: Math.round(gatewayFee * 100) / 100,
    platformCommission: Math.round(platformCommission * 100) / 100,
    venuePayable: Math.round(venuePayable * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2B — FEATURE FLAG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Feature flag: Full Upfront Payment Model (Phase 2B).
 *
 * When true:
 *  - Players joining a match pay the FULL fee (reserveFee + finalFeePerPlayer)
 *    in a single 'match_join' payment at join time.
 *  - The two-step reserve + final flow is disabled for new joins.
 *  - Legacy 'match_reserve' / 'match_final' payments are still recognised
 *    by the webhook and verify endpoints for backward compatibility.
 *
 * When false:
 *  - Classic two-step flow (reserve now, final payment after match confirms).
 *
 * Controlled via env var ENABLE_UPFRONT_MODEL=true|false.
 * Defaults to TRUE (Phase 2B is the new default).
 *
 * @constant
 */
export const ENABLE_UPFRONT_MODEL: boolean =
  env.ENABLE_UPFRONT_MODEL;

/**
 * Calculate the single upfront join amount for a player.
 *
 * Upfront amount = reserveFeePerPlayer + finalFeePerPlayer
 *
 * @param reserveFee   - Per-player reserve fee (₹)
 * @param finalFee     - Per-player final fee (₹)
 * @returns Total upfront join fee (₹)
 */
export function calculateUpfrontJoinFee(
  reserveFee: number,
  finalFee: number
): number {
  return Math.round((reserveFee + finalFee) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type HostFeeTier = typeof HOST_FEE_TIERS[keyof typeof HOST_FEE_TIERS];

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — ATTENDANCE VERIFICATION FEATURE FLAG & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Feature flag: Attendance Verification Workflow (Phase 3).
 *
 * When true:
 *  - Match completion requires attendance confirmation quorum before payouts release.
 *  - The automatic time-based completion cron is replaced with a verification flow.
 *  - Quorum: host confirmation + max(2, ceil(50% of participants)) player confirmations.
 *  - Grace period: 48 hours from match end time.
 *  - Settlement hold: 24 hours after quorum reached.
 *  - Unverified matches after 48h → "disputed" → admin review.
 *
 * When false:
 *  - Legacy automatic completion (3h after match end) remains unchanged.
 *
 * Controlled via env var ENABLE_ATTENDANCE_VERIFICATION=true|false.
 * Defaults to TRUE (Phase 3 is the new default).
 */
export const ENABLE_ATTENDANCE_VERIFICATION: boolean =
  env.ENABLE_ATTENDANCE_VERIFICATION;

/** Hours after match end before verification window expires → disputed. */
export const ATTENDANCE_GRACE_PERIOD_HOURS = 48;

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — REWARDS ENGINE FEATURE FLAG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Feature flag: Wallet, Rewards & Referral Engine (Phase 5).
 *
 * When true:
 *  - First match cashback (₹50) is credited after first completed match.
 *  - Milestone rewards are credited at 1/5/10/25/50/100 completed matches.
 *  - Referral rewards: referrer ₹100, referred ₹50 welcome bonus.
 *  - Reward expiry cron runs (180-day promotional window).
 *  - Wallet redemption (POST /wallet/redeem) is active.
 *  - Notifications sent for all reward events.
 *
 * When false:
 *  - All reward & referral processing is silently skipped.
 *  - Core wallet operations (credit/debit/balance) remain fully active.
 *  - Rollback plan: set ENABLE_REWARDS_ENGINE=false — no DB rollback required.
 *
 * Controlled via env var ENABLE_REWARDS_ENGINE=true|false.
 * Defaults to TRUE (Phase 5 is the new default).
 */
export const ENABLE_REWARDS_ENGINE: boolean =
  env.ENABLE_REWARDS_ENGINE;

/**
 * Promotional reward expiry window (days).
 * Rewards credited after this period are marked 'expired' and cannot be used.
 */
export const REWARD_EXPIRY_DAYS = 180;

/**
 * Referrer reward amount (₹) when referred user completes first paid match.
 */
export const REFERRAL_REFERRER_REWARD = 100;

/**
 * Referred user welcome bonus (₹) credited on first paid match completion.
 */
export const REFERRAL_REFEREE_REWARD = 50;

/**
 * First match cashback amount (₹) for players after completing first match.
 */
export const FIRST_MATCH_CASHBACK_AMOUNT = 50;


/**
 * Calculate the required player confirmation quorum.
 * Rule: max(2, ceil(50% of totalParticipants))
 *
 * @param totalParticipants - Number of paid participants (excluding host)
 * @returns Minimum number of player confirmations required
 */
export function calculatePlayerQuorum(totalParticipants: number): number {
  return Math.max(2, Math.ceil(totalParticipants * 0.5));
}

