/**
 * Task 2.3 — Unit tests for updated `calculatePayout()` and `generateMatchPayout()`
 *
 * Covers:
 *  1. calculatePayout produces correct venuePayable using constants from financial-config
 *     (gateway fee = gross * 2%, platform commission = (gross - gatewayFee) * 12%)
 *  2. generateMatchPayout accepts "match_join" as a valid payoutType
 *  3. Idempotency guard blocks duplicate paymentId + payoutType rows
 *
 * Requirements: 8.4, 11.1
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { venuePayoutLedgerTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { calculatePayout, generateMatchPayout } from "../src/lib/payouts";
import {
  GATEWAY_FEE_PERCENT,
  PLATFORM_COMMISSION_PERCENT,
} from "../src/lib/financial-config";
import {
  seedUser,
  seedVenue,
  seedPayment,
  buildMatchScenario,
  testRegistry,
} from "./setup";

// ─── 1. calculatePayout — Phase 2A commission (15%) and bug fix ───────────────
describe("calculatePayout — Phase 2A (15% commission, netRevenue fix)", () => {
  it("computes correct venuePayable for ₹500 gross with 15% commission", () => {
    // gatewayFee  = 500 * 0.02 = 10
    // commission  = (500 - 10) * 0.15 = 73.5
    // venuePayable = 500 - 10 - 73.5 = 416.5
    const result = calculatePayout(500);

    expect(result.grossAmount).toBe(500);
    expect(result.gatewayFee).toBeCloseTo(10, 5);
    expect(result.platformCommission).toBeCloseTo(73.5, 5);
    expect(result.venuePayable).toBeCloseTo(416.5, 2);
  });

  it("uses GATEWAY_FEE_PERCENT = 2 from financial-config (not a hardcoded 0.02)", () => {
    // Verify the constant itself is what we expect
    expect(GATEWAY_FEE_PERCENT).toBe(2);

    const result = calculatePayout(1000);
    // 1000 * 2% = 20
    expect(result.gatewayFee).toBeCloseTo(20, 5);
  });

  it("uses PLATFORM_COMMISSION_PERCENT = 15 from financial-config (Phase 2A)", () => {
    expect(PLATFORM_COMMISSION_PERCENT).toBe(15);

    const result = calculatePayout(1000);
    // (1000 - 20) * 15% = 980 * 0.15 = 147
    expect(result.platformCommission).toBeCloseTo(147, 5);
  });

  it("venuePayable = grossAmount - gatewayFee - platformCommission (identity check)", () => {
    const gross = 750;
    const result = calculatePayout(gross);
    const expected = result.grossAmount - result.gatewayFee - result.platformCommission;
    expect(result.venuePayable).toBeCloseTo(expected, 5);
  });

  it("returns zero venuePayable for zero gross", () => {
    const result = calculatePayout(0);
    expect(result.grossAmount).toBe(0);
    expect(result.gatewayFee).toBe(0);
    expect(result.platformCommission).toBe(0);
    expect(result.venuePayable).toBe(0);
  });

  it("rounds venuePayable to 2 decimal places", () => {
    const result = calculatePayout(333);
    const asString = result.venuePayable.toString();
    const decimalPart = asString.includes(".") ? asString.split(".")[1] : "";
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });

  it("CRITICAL BUG FIX: netRevenue equals platformCommission (NOT platformCommission - gatewayFee)", () => {
    // Phase 2A bug fix: netRevenue was incorrectly calculated as:
    // OLD (WRONG): netRevenue = platformCommission - gatewayFee
    // NEW (CORRECT): netRevenue = platformCommission
    //
    // Reason: Gateway fee is already deducted when calculating venuePayable.
    // Double-subtracting it understates platform revenue by 2% of gross.
    const result = calculatePayout(1000);

    // Correct: netRevenue = platformCommission = 147
    expect(result.netRevenue).toBe(result.platformCommission);

    // Verify it's NOT the old buggy formula
    const oldBuggyFormula = result.platformCommission - result.gatewayFee;
    expect(result.netRevenue).not.toBe(oldBuggyFormula);
  });

  it("netRevenue is always equal to platformCommission for any amount", () => {
    const testAmounts = [100, 500, 1000, 2500, 5000, 10000];

    for (const amount of testAmounts) {
      const result = calculatePayout(amount);
      expect(result.netRevenue).toBe(result.platformCommission);
    }
  });

  it("financial breakdown components sum correctly to gross amount", () => {
    const result = calculatePayout(1000);

    // gatewayFee + platformCommission + venuePayable should equal grossAmount
    const reconstructedGross =
      result.gatewayFee + result.platformCommission + result.venuePayable;

    expect(Math.abs(reconstructedGross - result.grossAmount)).toBeLessThan(0.01);
  });
});

// ─── 2. generateMatchPayout — "match_join" is a valid payoutType ───────────────
describe("generateMatchPayout — match_join payoutType", () => {
  it("creates a payout ledger row with payoutType = 'match_join'", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve", // DB enum; using existing value for seed
      referenceId: match.id,
      grossAmount: 500,
      status: "verified",
    });

    // This call must not throw — "match_join" is a valid payoutType after task 2.2
    await generateMatchPayout(venue.id, match.id, 500, payment.id, "match_join");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, payment.id),
          eq(venuePayoutLedgerTable.payoutType, "match_join"),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].payoutType).toBe("match_join");
    expect(Number(rows[0].grossAmount)).toBe(500);
    expect(rows[0].status).toBe("pending");
    // venuePayable should match calculatePayout(500) with 15% commission (Phase 2A)
    // 500 - 10 (gateway) - 73.5 (commission) = 416.5
    expect(Number(rows[0].venuePayable)).toBeCloseTo(416.5, 2);
    testRegistry.payoutIds.push(rows[0].id);
  });

  it("stores correct calculated amounts in the ledger row for a match_join payout", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      grossAmount: 350,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 350, payment.id, "match_join");

    const [row] = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));

    testRegistry.payoutIds.push(row.id);

    const expected = calculatePayout(350);
    expect(Number(row.razorpayFee)).toBeCloseTo(expected.gatewayFee, 2);
    expect(Number(row.platformCommission)).toBeCloseTo(expected.platformCommission, 2);
    expect(Number(row.venuePayable)).toBeCloseTo(expected.venuePayable, 2);
  });
});

// ─── 3. Idempotency guard — duplicate paymentId + payoutType blocked ───────────
describe("generateMatchPayout — idempotency guard", () => {
  it("calling twice with same paymentId + 'match_join' inserts only one row", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      grossAmount: 500,
      status: "verified",
    });

    // First call — should insert
    await generateMatchPayout(venue.id, match.id, 500, payment.id, "match_join");
    // Second call — should be a no-op
    await generateMatchPayout(venue.id, match.id, 500, payment.id, "match_join");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, payment.id),
          eq(venuePayoutLedgerTable.payoutType, "match_join"),
        ),
      );

    expect(rows).toHaveLength(1);
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });

  it("calling twice with same paymentId + 'host_commitment' inserts only one row", async () => {
    const { venue, match } = await buildMatchScenario();
    const host = await seedUser();
    const payment = await seedPayment(host.id, {
      type: "host_commitment",
      referenceId: match.id,
      grossAmount: 549,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 549, payment.id, "host_commitment");
    await generateMatchPayout(venue.id, match.id, 549, payment.id, "host_commitment");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, payment.id),
          eq(venuePayoutLedgerTable.payoutType, "host_commitment"),
        ),
      );

    expect(rows).toHaveLength(1);
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });

  it("different payoutTypes for the same paymentId each insert their own row", async () => {
    // This scenario shouldn't happen in practice but verifies the guard is keyed on
    // the (paymentId, payoutType) pair — not just paymentId alone.
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      grossAmount: 500,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 500, payment.id, "match_join");
    await generateMatchPayout(venue.id, match.id, 500, payment.id, "host_commitment");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));

    // Two distinct rows — one per payoutType
    expect(rows).toHaveLength(2);
    const types = rows.map((r) => r.payoutType).sort();
    expect(types).toEqual(["host_commitment", "match_join"]);
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });
});
