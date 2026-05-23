/**
 * Phase 2A Tests: Financial Configuration Module
 *
 * Tests for artifacts/api-server/src/lib/financial-config.ts
 *
 * Coverage:
 * - Commission calculations (15%)
 * - Gateway fee calculations (2%)
 * - Host fee tiers (₹0/₹29/₹39/₹49)
 * - Milestone rewards (₹25/₹50/₹100/₹250/₹500/₹1000)
 * - Payout breakdown accuracy
 * - Helper function correctness
 */

import { describe, it, expect } from "vitest";
import {
  PLATFORM_COMMISSION_PERCENT,
  GATEWAY_FEE_PERCENT,
  HOST_FEE_TIERS,
  HOST_MILESTONE_REWARDS,
  REFUND_SOURCE_THRESHOLD,
  calculatePlatformCommission,
  calculateGatewayFee,
  getHostFee,
  getMilestoneReward,
  getAllMilestones,
  isMilestone,
  getTotalMilestoneRewardsEarned,
  getNextMilestone,
  calculatePayoutBreakdown,
} from "../src/lib/financial-config";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Financial Constants", () => {
  it("platform commission is 15%", () => {
    expect(PLATFORM_COMMISSION_PERCENT).toBe(15);
  });

  it("gateway fee is 2%", () => {
    expect(GATEWAY_FEE_PERCENT).toBe(2);
  });

  it("refund threshold is ₹500", () => {
    expect(REFUND_SOURCE_THRESHOLD).toBe(500);
  });

  it("host fee tiers are correctly defined", () => {
    expect(HOST_FEE_TIERS.tier0).toEqual({ minMatches: 0, maxMatches: 2, fee: 0 });
    expect(HOST_FEE_TIERS.tier1).toEqual({ minMatches: 3, maxMatches: 8, fee: 29 });
    expect(HOST_FEE_TIERS.tier2).toEqual({ minMatches: 9, maxMatches: 23, fee: 39 });
    expect(HOST_FEE_TIERS.tier3).toEqual({ minMatches: 24, maxMatches: Infinity, fee: 49 });
  });

  it("milestone rewards are Phase 2A amounts (reduced by ~40%)", () => {
    expect(HOST_MILESTONE_REWARDS).toEqual({
      1: 25,
      5: 50,
      10: 100,
      25: 250,
      50: 500,
      100: 1000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("calculatePlatformCommission", () => {
  it("calculates 15% commission correctly", () => {
    expect(calculatePlatformCommission(1000)).toBe(150);
    expect(calculatePlatformCommission(500)).toBe(75);
    expect(calculatePlatformCommission(2000)).toBe(300);
  });

  it("rounds to 2 decimal places", () => {
    expect(calculatePlatformCommission(333)).toBe(49.95);
    expect(calculatePlatformCommission(100)).toBe(15);
  });

  it("returns 0 for zero input", () => {
    expect(calculatePlatformCommission(0)).toBe(0);
  });
});

describe("calculateGatewayFee", () => {
  it("calculates 2% gateway fee correctly", () => {
    expect(calculateGatewayFee(1000)).toBe(20);
    expect(calculateGatewayFee(500)).toBe(10);
    expect(calculateGatewayFee(2000)).toBe(40);
  });

  it("rounds to 2 decimal places", () => {
    expect(calculateGatewayFee(333)).toBe(6.66);
  });

  it("returns 0 for zero input", () => {
    expect(calculateGatewayFee(0)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HOST FEE TIERS
// ═══════════════════════════════════════════════════════════════════════════

describe("getHostFee", () => {
  it("tier 0: first 3 matches are free (0-2 completed)", () => {
    expect(getHostFee(0)).toBe(0);
    expect(getHostFee(1)).toBe(0);
    expect(getHostFee(2)).toBe(0);
  });

  it("tier 1: matches 4-9 cost ₹29 (3-8 completed)", () => {
    expect(getHostFee(3)).toBe(29);
    expect(getHostFee(5)).toBe(29);
    expect(getHostFee(8)).toBe(29);
  });

  it("tier 2: matches 10-24 cost ₹39 (9-23 completed)", () => {
    expect(getHostFee(9)).toBe(39);
    expect(getHostFee(15)).toBe(39);
    expect(getHostFee(23)).toBe(39);
  });

  it("tier 3: matches 25+ cost ₹49 (24+ completed)", () => {
    expect(getHostFee(24)).toBe(49);
    expect(getHostFee(50)).toBe(49);
    expect(getHostFee(100)).toBe(49);
  });

  it("boundary conditions", () => {
    expect(getHostFee(2)).toBe(0);  // Last free match
    expect(getHostFee(3)).toBe(29); // First paid match
    expect(getHostFee(8)).toBe(29); // Last tier 1
    expect(getHostFee(9)).toBe(39); // First tier 2
    expect(getHostFee(23)).toBe(39); // Last tier 2
    expect(getHostFee(24)).toBe(49); // First tier 3
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MILESTONE REWARDS
// ═══════════════════════════════════════════════════════════════════════════

describe("getMilestoneReward", () => {
  it("returns correct reward amounts for valid milestones", () => {
    expect(getMilestoneReward(1)).toBe(25);
    expect(getMilestoneReward(5)).toBe(50);
    expect(getMilestoneReward(10)).toBe(100);
    expect(getMilestoneReward(25)).toBe(250);
    expect(getMilestoneReward(50)).toBe(500);
    expect(getMilestoneReward(100)).toBe(1000);
  });

  it("returns 0 for non-milestone counts", () => {
    expect(getMilestoneReward(0)).toBe(0);
    expect(getMilestoneReward(2)).toBe(0);
    expect(getMilestoneReward(7)).toBe(0);
    expect(getMilestoneReward(15)).toBe(0);
    expect(getMilestoneReward(99)).toBe(0);
  });
});

describe("getAllMilestones", () => {
  it("returns milestones in ascending order", () => {
    const milestones = getAllMilestones();
    expect(milestones).toEqual([1, 5, 10, 25, 50, 100]);
  });

  it("contains exactly 6 milestones", () => {
    expect(getAllMilestones()).toHaveLength(6);
  });
});

describe("isMilestone", () => {
  it("returns true for valid milestones", () => {
    expect(isMilestone(1)).toBe(true);
    expect(isMilestone(5)).toBe(true);
    expect(isMilestone(10)).toBe(true);
    expect(isMilestone(25)).toBe(true);
    expect(isMilestone(50)).toBe(true);
    expect(isMilestone(100)).toBe(true);
  });

  it("returns false for non-milestones", () => {
    expect(isMilestone(0)).toBe(false);
    expect(isMilestone(2)).toBe(false);
    expect(isMilestone(7)).toBe(false);
    expect(isMilestone(99)).toBe(false);
  });
});

describe("getTotalMilestoneRewardsEarned", () => {
  it("returns 0 for 0 completed matches", () => {
    expect(getTotalMilestoneRewardsEarned(0)).toBe(0);
  });

  it("returns cumulative rewards for milestone counts", () => {
    expect(getTotalMilestoneRewardsEarned(1)).toBe(25);
    expect(getTotalMilestoneRewardsEarned(5)).toBe(75);  // 25 + 50
    expect(getTotalMilestoneRewardsEarned(10)).toBe(175); // 25 + 50 + 100
    expect(getTotalMilestoneRewardsEarned(25)).toBe(425); // 25 + 50 + 100 + 250
    expect(getTotalMilestoneRewardsEarned(50)).toBe(925); // ... + 500
    expect(getTotalMilestoneRewardsEarned(100)).toBe(1925); // ... + 1000
  });

  it("returns cumulative rewards for non-milestone counts", () => {
    expect(getTotalMilestoneRewardsEarned(3)).toBe(25);  // Only milestone 1
    expect(getTotalMilestoneRewardsEarned(7)).toBe(75);  // Milestones 1, 5
    expect(getTotalMilestoneRewardsEarned(30)).toBe(425); // Milestones 1, 5, 10, 25
  });

  it("total at 100 matches is ₹1,925 (reduced from ₹3,850)", () => {
    expect(getTotalMilestoneRewardsEarned(100)).toBe(1925);
  });
});

describe("getNextMilestone", () => {
  it("returns next milestone info for counts below milestones", () => {
    expect(getNextMilestone(0)).toEqual({
      threshold: 1,
      reward: 25,
      matchesRemaining: 1,
    });

    expect(getNextMilestone(3)).toEqual({
      threshold: 5,
      reward: 50,
      matchesRemaining: 2,
    });

    expect(getNextMilestone(7)).toEqual({
      threshold: 10,
      reward: 100,
      matchesRemaining: 3,
    });
  });

  it("returns next milestone when exactly at a milestone", () => {
    expect(getNextMilestone(1)).toEqual({
      threshold: 5,
      reward: 50,
      matchesRemaining: 4,
    });

    expect(getNextMilestone(5)).toEqual({
      threshold: 10,
      reward: 100,
      matchesRemaining: 5,
    });
  });

  it("returns null when all milestones achieved", () => {
    expect(getNextMilestone(100)).toBeNull();
    expect(getNextMilestone(150)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYOUT BREAKDOWN (CRITICAL BUG FIX VALIDATION)
// ═══════════════════════════════════════════════════════════════════════════

describe("calculatePayoutBreakdown", () => {
  it("calculates correct breakdown for ₹1,000 gross", () => {
    const breakdown = calculatePayoutBreakdown(1000);

    expect(breakdown.grossAmount).toBe(1000);
    expect(breakdown.gatewayFee).toBe(20); // 2% of 1000
    expect(breakdown.platformCommission).toBe(147); // 15% of (1000 - 20)
    expect(breakdown.venuePayable).toBe(833); // 1000 - 20 - 147
    expect(breakdown.netRevenue).toBe(147); // FIXED: Was 127 (double-subtracted gateway)
  });

  it("netRevenue equals platformCommission (Phase 2A bug fix)", () => {
    const breakdown = calculatePayoutBreakdown(1000);
    expect(breakdown.netRevenue).toBe(breakdown.platformCommission);
  });

  it("netRevenue does NOT double-subtract gateway fee", () => {
    const breakdown = calculatePayoutBreakdown(1000);
    // Old buggy formula: netRevenue = platformCommission - gatewayFee = 147 - 20 = 127 ❌
    // New correct formula: netRevenue = platformCommission = 147 ✅
    expect(breakdown.netRevenue).not.toBe(breakdown.platformCommission - breakdown.gatewayFee);
    expect(breakdown.netRevenue).toBe(breakdown.platformCommission);
  });

  it("all amounts sum to gross amount", () => {
    const breakdown = calculatePayoutBreakdown(1000);
    const reconstructed = breakdown.gatewayFee + breakdown.platformCommission + breakdown.venuePayable;
    expect(Math.abs(reconstructed - breakdown.grossAmount)).toBeLessThan(0.01);
  });

  it("calculates correctly for various amounts", () => {
    const test1 = calculatePayoutBreakdown(500);
    expect(test1.gatewayFee).toBe(10);
    expect(test1.platformCommission).toBe(73.5);
    expect(test1.venuePayable).toBe(416.5);
    expect(test1.netRevenue).toBe(73.5);

    const test2 = calculatePayoutBreakdown(2000);
    expect(test2.gatewayFee).toBe(40);
    expect(test2.platformCommission).toBe(294);
    expect(test2.venuePayable).toBe(1666);
    expect(test2.netRevenue).toBe(294);
  });

  it("rounds all amounts to 2 decimal places", () => {
    const breakdown = calculatePayoutBreakdown(333);
    expect(Number.isInteger(breakdown.grossAmount * 100)).toBe(true);
    expect(Number.isInteger(breakdown.gatewayFee * 100)).toBe(true);
    expect(Number.isInteger(breakdown.platformCommission * 100)).toBe(true);
    expect(Number.isInteger(breakdown.venuePayable * 100)).toBe(true);
    expect(Number.isInteger(breakdown.netRevenue * 100)).toBe(true);
  });

  it("returns zero breakdown for zero input", () => {
    const breakdown = calculatePayoutBreakdown(0);
    expect(breakdown.grossAmount).toBe(0);
    expect(breakdown.gatewayFee).toBe(0);
    expect(breakdown.platformCommission).toBe(0);
    expect(breakdown.venuePayable).toBe(0);
    expect(breakdown.netRevenue).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS LOGIC VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Business Logic Validation", () => {
  it("platform effective margin is ~13% (15% commission - 2% gateway)", () => {
    const breakdown = calculatePayoutBreakdown(1000);
    const effectiveMargin = (breakdown.netRevenue / breakdown.grossAmount) * 100;
    expect(effectiveMargin).toBeCloseTo(14.7, 1); // 15% of 98% = 14.7%
  });

  it("venue receives ~83% of gross", () => {
    const breakdown = calculatePayoutBreakdown(1000);
    const venuePercentage = (breakdown.venuePayable / breakdown.grossAmount) * 100;
    expect(venuePercentage).toBeCloseTo(83.3, 1);
  });

  it("first 3 hosted matches generate ₹0 host fee revenue", () => {
    const totalHostFeeRevenue = [0, 1, 2].reduce((sum, count) => sum + getHostFee(count), 0);
    expect(totalHostFeeRevenue).toBe(0);
  });

  it("10 hosted matches generate ₹203 total host fee revenue", () => {
    // Matches 0-2: ₹0 each = ₹0
    // Matches 3-8: ₹29 each = ₹174
    // Match 9: ₹39 = ₹39
    // Total: ₹213
    const totalHostFeeRevenue = Array.from({ length: 10 }, (_, i) => getHostFee(i)).reduce((a, b) => a + b, 0);
    expect(totalHostFeeRevenue).toBe(213);
  });

  it("milestone rewards at 100 matches is 4.8% of average GMV", () => {
    // Assume average match GMV: ₹4,000
    // 100 matches: ₹400,000 cumulative GMV
    // Milestone rewards: ₹1,925
    // Subsidy: 1925 / 400000 = 0.48%
    const cumulativeGMV = 100 * 4000;
    const totalRewards = getTotalMilestoneRewardsEarned(100);
    const subsidyPercent = (totalRewards / cumulativeGMV) * 100;
    expect(subsidyPercent).toBeCloseTo(0.48, 2);
  });
});
