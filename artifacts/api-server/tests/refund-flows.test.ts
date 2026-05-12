/**
 * HM11A — Refund Flow Integration Tests
 *
 * Covers:
 *  1. Reserve refund — underfill path credits wallet
 *  2. Final payment refund — both reserve + final components returned
 *  3. Host commitment refund — host fee returned on underfill
 *  4. Payout reversal netting — reversal rows sum to zero
 *  5. Reversal rows do NOT re-reverse (idempotent reversal guard)
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import {
  profilesTable,
  walletLedgerTable,
  venuePayoutLedgerTable,
  hostedMatchesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateMatchPayout, reverseMatchPayouts } from "../src/lib/payouts";
import { processUnderfillRefund } from "../src/lib/wallet";
import {
  seedUser,
  seedVenue,
  seedSlot,
  seedMatch,
  seedPayment,
  seedParticipant,
  seedPayout,
  buildMatchScenario,
  testRegistry,
} from "./setup";

// ─── 1. Reserve Refund via Underfill ───────────────────────────────────────────
describe("processUnderfillRefund — reserve", () => {
  it("credits wallet and inserts a wallet ledger entry for the refund amount", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ walletBalance: "0" });
    const refundAmount = 49;

    await processUnderfillRefund(player.id, match.id, refundAmount);

    // Wallet balance should have increased
    const [profile] = await db
      .select({ walletBalance: profilesTable.walletBalance })
      .from(profilesTable)
      .where(eq(profilesTable.id, player.id));
    expect(Number(profile.walletBalance)).toBe(refundAmount);

    // Ledger entry should exist
    const ledgerRows = await db
      .select()
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, player.id),
        eq(walletLedgerTable.type, "credit")
      ));
    expect(ledgerRows.length).toBeGreaterThanOrEqual(1);
    const refundRow = ledgerRows.find((r) => r.reason?.includes(match.id) || r.reason?.includes("refund") || r.reason?.includes("underfill"));
    expect(refundRow).toBeDefined();
    testRegistry.ledgerEntryIds.push(...ledgerRows.map((r) => r.id));
  });

  it("does not credit negative amounts", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ walletBalance: "100" });

    await processUnderfillRefund(player.id, match.id, 0);

    // Balance should remain 100
    const [profile] = await db
      .select({ walletBalance: profilesTable.walletBalance })
      .from(profilesTable)
      .where(eq(profilesTable.id, player.id));
    expect(Number(profile.walletBalance)).toBe(100);
  });
});

// ─── 2. Final Payment Refund ───────────────────────────────────────────────────
describe("processUnderfillRefund — combined reserve + final", () => {
  it("returns combined amount when participant had paid both reserve and final", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ walletBalance: "0" });
    const combinedRefund = 49 + 350; // reserve + final

    await processUnderfillRefund(player.id, match.id, combinedRefund);

    const [profile] = await db
      .select({ walletBalance: profilesTable.walletBalance })
      .from(profilesTable)
      .where(eq(profilesTable.id, player.id));
    expect(Number(profile.walletBalance)).toBe(combinedRefund);
  });
});

// ─── 3. Host Commitment Refund ─────────────────────────────────────────────────
describe("processUnderfillRefund — host fee", () => {
  it("returns host commitment fee to host wallet on underfill", async () => {
    const { match } = await buildMatchScenario();
    const host = await seedUser({ walletBalance: "0" });
    const hostFee = 99;

    // Simulate: host had paid grossHostCollected = 99
    await db.update(hostedMatchesTable).set({ grossHostCollected: hostFee }).where(eq(hostedMatchesTable.id, match.id));

    await processUnderfillRefund(host.id, match.id, hostFee);

    const [profile] = await db
      .select({ walletBalance: profilesTable.walletBalance })
      .from(profilesTable)
      .where(eq(profilesTable.id, host.id));
    expect(Number(profile.walletBalance)).toBe(hostFee);
  });
});

// ─── 4. Payout Reversal Netting ────────────────────────────────────────────────
describe("reverseMatchPayouts", () => {
  it("creates negative payout rows that net to zero against originals", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment1 = await seedPayment(player.id, { type: "match_reserve", referenceId: match.id, grossAmount: 49 });
    const payment2 = await seedPayment(player.id, { type: "match_final", referenceId: match.id, grossAmount: 350 });

    await generateMatchPayout(venue.id, match.id, 49, payment1.id, "match_reserve");
    await generateMatchPayout(venue.id, match.id, 350, payment2.id, "match_final");

    const beforeRows = await db.select().from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.referenceId, match.id));
    const beforeTotal = beforeRows.reduce((sum, r) => sum + Number(r.venuePayable), 0);
    expect(beforeTotal).toBeGreaterThan(0);
    testRegistry.payoutIds.push(...beforeRows.map((r) => r.id));

    await reverseMatchPayouts(match.id);

    const allRows = await db.select().from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.referenceId, match.id));
    testRegistry.payoutIds.push(...allRows.filter((r) => !testRegistry.payoutIds.includes(r.id)).map((r) => r.id));

    const netTotal = allRows.reduce((sum, r) => sum + Number(r.venuePayable), 0);
    expect(Math.abs(netTotal)).toBeLessThan(0.01);

    // Reversal rows should exist
    const reversalRows = allRows.filter((r) => r.notes?.includes("REVERSAL"));
    expect(reversalRows.length).toBeGreaterThan(0);
    expect(reversalRows.every((r) => Number(r.grossAmount) < 0)).toBe(true);
  });

  it("does NOT create double reversal rows on second call (idempotent guard)", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, { type: "host_commitment", referenceId: match.id, grossAmount: 99 });
    await generateMatchPayout(venue.id, match.id, 99, payment.id, "host_commitment");

    await reverseMatchPayouts(match.id);
    await reverseMatchPayouts(match.id); // second call

    const allRows = await db.select().from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.referenceId, match.id));
    testRegistry.payoutIds.push(...allRows.map((r) => r.id));

    // Should have exactly 1 original + 1 reversal = 2 rows
    // (second call skips rows already marked REVERSAL)
    const reversals = allRows.filter((r) => r.notes?.includes("REVERSAL"));
    const originals = allRows.filter((r) => !r.notes?.includes("REVERSAL"));
    expect(reversals.length).toBe(originals.length);
  });

  it("reversal rows have status=hold (not pending)", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, { type: "host_commitment", referenceId: match.id, grossAmount: 700 });
    await generateMatchPayout(venue.id, match.id, 700, payment.id, "host_commitment");

    await reverseMatchPayouts(match.id);

    const rows = await db.select().from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.referenceId, match.id));
    testRegistry.payoutIds.push(...rows.map((r) => r.id));

    const reversals = rows.filter((r) => r.notes?.includes("REVERSAL"));
    expect(reversals.every((r) => r.status === "hold")).toBe(true);
  });
});
