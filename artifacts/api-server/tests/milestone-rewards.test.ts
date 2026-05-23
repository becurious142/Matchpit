/**
 * HM12 — Host Milestone Rewards Unit Tests
 *
 * Tests for `processHostMilestoneRewards()` in `src/lib/wallet.ts`
 *
 * Covers:
 *  1. First call with completedHostedCount = 1 credits ₹50 exactly once
 *  2. Second call with same count is a no-op (idempotency)
 *  3. Call with completedHostedCount = 10 credits milestones 1, 5, and 10 in a single invocation
 *  4. completedHostedCount = 0 credits nothing
 *
 * Requirements: 9.3–9.5, 16.7
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import {
  profilesTable,
  walletLedgerTable,
  rewardEventsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { processHostMilestoneRewards } from "../src/lib/wallet";
import { seedUser, testRegistry } from "./setup";

// ─── Helper: fetch current wallet balance ─────────────────────────────────────
async function getWalletBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ walletBalance: profilesTable.walletBalance })
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);
  return Number(row?.walletBalance ?? 0);
}

// ─── Helper: fetch reward_events rows for a user ──────────────────────────────
async function getMilestoneRewardEvents(userId: string) {
  return db
    .select()
    .from(rewardEventsTable)
    .where(
      and(
        eq(rewardEventsTable.userId, userId),
        eq(rewardEventsTable.eventType, "host_milestone_reward"),
      ),
    );
}

// ─── Helper: fetch wallet ledger credit entries for a user ────────────────────
async function getWalletLedgerCredits(userId: string) {
  return db
    .select()
    .from(walletLedgerTable)
    .where(
      and(
        eq(walletLedgerTable.userId, userId),
        eq(walletLedgerTable.type, "credit"),
      ),
    );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("processHostMilestoneRewards", () => {
  it("first call with completedHostedCount = 1 credits ₹25 exactly once", async () => {
    const user = await seedUser({ walletBalance: "0" });

    await processHostMilestoneRewards(user.id, 1);

    // Wallet balance should have increased by exactly 25
    const balance = await getWalletBalance(user.id);
    expect(balance).toBe(25);

    // Exactly one wallet ledger credit entry
    const ledgerEntries = await getWalletLedgerCredits(user.id);
    expect(ledgerEntries).toHaveLength(1);
    expect(Number(ledgerEntries[0].amount)).toBe(25);
    testRegistry.ledgerEntryIds.push(...ledgerEntries.map((e) => e.id));

    // Exactly one reward_events row with correct metadata
    const rewardEvents = await getMilestoneRewardEvents(user.id);
    expect(rewardEvents).toHaveLength(1);
    expect(rewardEvents[0].eventType).toBe("host_milestone_reward");
    const meta = rewardEvents[0].metadata as { milestoneCount?: number } | null;
    expect(meta?.milestoneCount).toBe(1);
    expect(Number(rewardEvents[0].amount)).toBe(25);
  });

  it("second call with same count is a no-op (idempotency)", async () => {
    const user = await seedUser({ walletBalance: "0" });

    // Call twice with the same completedHostedCount
    await processHostMilestoneRewards(user.id, 1);
    await processHostMilestoneRewards(user.id, 1);

    // Wallet balance should have increased by exactly 25 (not 50)
    const balance = await getWalletBalance(user.id);
    expect(balance).toBe(25);

    // Exactly one reward_events row (not two)
    const rewardEvents = await getMilestoneRewardEvents(user.id);
    expect(rewardEvents).toHaveLength(1);

    // Exactly one wallet ledger credit entry
    const ledgerEntries = await getWalletLedgerCredits(user.id);
    expect(ledgerEntries).toHaveLength(1);
    testRegistry.ledgerEntryIds.push(...ledgerEntries.map((e) => e.id));
  });

  it("call with completedHostedCount = 10 credits milestones 1, 5, and 10 in a single invocation", async () => {
    const user = await seedUser({ walletBalance: "0" });

    // Single call with count = 10 should credit milestones 1 (₹25), 5 (₹50), and 10 (₹100)
    await processHostMilestoneRewards(user.id, 10);

    // Wallet balance should have increased by 25 + 50 + 100 = 175
    const balance = await getWalletBalance(user.id);
    expect(balance).toBe(175);

    // Exactly three reward_events rows
    const rewardEvents = await getMilestoneRewardEvents(user.id);
    expect(rewardEvents).toHaveLength(3);

    // Verify each milestone is represented
    const milestoneCounts = rewardEvents.map((e) => {
      const meta = e.metadata as { milestoneCount?: number } | null;
      return meta?.milestoneCount;
    });
    expect(milestoneCounts).toContain(1);
    expect(milestoneCounts).toContain(5);
    expect(milestoneCounts).toContain(10);

    // Verify amounts
    const amounts = rewardEvents.map((e) => Number(e.amount));
    expect(amounts).toContain(25);
    expect(amounts).toContain(50);
    expect(amounts).toContain(100);

    // Exactly three wallet ledger credit entries
    const ledgerEntries = await getWalletLedgerCredits(user.id);
    expect(ledgerEntries).toHaveLength(3);
    testRegistry.ledgerEntryIds.push(...ledgerEntries.map((e) => e.id));
  });

  it("completedHostedCount = 0 credits nothing", async () => {
    const user = await seedUser({ walletBalance: "0" });

    await processHostMilestoneRewards(user.id, 0);

    // Wallet balance should still be 0
    const balance = await getWalletBalance(user.id);
    expect(balance).toBe(0);

    // Zero reward_events rows
    const rewardEvents = await getMilestoneRewardEvents(user.id);
    expect(rewardEvents).toHaveLength(0);

    // Zero wallet ledger entries
    const ledgerEntries = await getWalletLedgerCredits(user.id);
    expect(ledgerEntries).toHaveLength(0);
  });
});
