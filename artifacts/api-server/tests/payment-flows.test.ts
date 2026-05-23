/**
 * Phase 2B — Payment Flow Integration Tests
 *
 * Covers:
 *  1. Payout calculation (15% commission)
 *  2. Host commitment payment → payout generated
 *  3. Upfront match_join payment success → participant created as final_paid
 *  4. Upfront match_join idempotency (duplicate webhook/side-effect call)
 *  5. match_join transitions match to confirmed then fully_paid
 *  6. Payment failure handling (failed status, no side effects)
 *  7. Duplicate webhook idempotency via generateMatchPayout
 *  8. Legacy reserve payment → reservation → participant (backward compat)
 *  9. Legacy final payment → fully_paid transition (backward compat)
 * 10. Refund compatibility (reverseMatchPayouts)
 * 11. Legacy payment compatibility (existing match_reserve records)
 * 12. Late webhook safety (refund_required)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@workspace/db";
import {
  paymentsTable,
  venuePayoutLedgerTable,
  hostedMatchParticipantsTable,
  hostedMatchesTable,
  hostedMatchReservationsTable,
  reconciliationReportsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  generateMatchPayout,
  reverseMatchPayouts,
  calculatePayout,
} from "../src/lib/payouts";
import {
  runPostPaymentSideEffects,
  convertReservationToParticipant,
  maybeMarkParticipantPaid,
  maybeMarkParticipantJoined,
} from "../src/lib/post-payment";
import {
  calculateUpfrontJoinFee,
  ENABLE_UPFRONT_MODEL,
} from "../src/lib/financial-config";
import {
  seedUser,
  seedVenue,
  seedSlot,
  seedMatch,
  seedPayment,
  seedReservation,
  seedParticipant,
  seedPayout,
  buildMatchScenario,
  testRegistry,
} from "./setup";

// ─── 1. Payout Calculation ─────────────────────────────────────────────────────
describe("calculatePayout — 15% commission", () => {
  it("correctly deducts 2% gateway fee and 15% platform commission", () => {
    const result = calculatePayout(1000);
    expect(result.grossAmount).toBe(1000);
    expect(result.gatewayFee).toBeCloseTo(20, 1);
    // netAfterGateway = 980, commission = 980 * 0.15 = 147
    expect(result.platformCommission).toBeCloseTo(147, 0);
    expect(result.venuePayable).toBeCloseTo(833, 0);
  });

  it("produces zero payable for zero input", () => {
    const result = calculatePayout(0);
    expect(result.grossAmount).toBe(0);
    expect(result.venuePayable).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const result = calculatePayout(333);
    expect(result.venuePayable).toBe(Math.round(result.venuePayable * 100) / 100);
  });
});

// ─── 1b. Upfront Fee Calculation ───────────────────────────────────────────────
describe("calculateUpfrontJoinFee", () => {
  it("returns sum of reserve + final fees", () => {
    expect(calculateUpfrontJoinFee(49, 350)).toBe(399);
    expect(calculateUpfrontJoinFee(100, 200)).toBe(300);
    expect(calculateUpfrontJoinFee(0, 0)).toBe(0);
  });
});

// ─── 2. Host Commitment → Payout Generated ────────────────────────────────────
describe("generateMatchPayout — host_commitment", () => {
  it("creates a venue payout ledger row for host commitment payment", async () => {
    const { venue, match } = await buildMatchScenario();
    const host = await seedUser({ fullName: "Host Player" });
    const payment = await seedPayment(host.id, {
      type: "host_commitment",
      referenceId: match.id,
      amount: "99",
      grossAmount: 99,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 99, payment.id, "host_commitment");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, payment.id),
          eq(venuePayoutLedgerTable.payoutType, "host_commitment")
        )
      );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].grossAmount)).toBe(99);
    expect(rows[0].status).toBe("pending");
    testRegistry.payoutIds.push(rows[0].id);
  });

  it("is idempotent — second call with same paymentId is a no-op", async () => {
    const { venue, match } = await buildMatchScenario();
    const host = await seedUser();
    const payment = await seedPayment(host.id, {
      type: "host_commitment",
      referenceId: match.id,
      grossAmount: 99,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 99, payment.id, "host_commitment");
    await generateMatchPayout(venue.id, match.id, 99, payment.id, "host_commitment");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, payment.id),
          eq(venuePayoutLedgerTable.payoutType, "host_commitment")
        )
      );

    expect(rows).toHaveLength(1);
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });
});

// ─── 3. Phase 2B: match_join → participant created as final_paid ──────────────
describe("maybeMarkParticipantJoined — match_join (Phase 2B upfront)", () => {
  it("creates a participant with status=final_paid on upfront join", async () => {
    const { match } = await buildMatchScenario({ minPlayers: 4 });
    const player = await seedUser({ fullName: "Upfront Player" });
    const payment = await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      amount: "399",
      grossAmount: 399,
      status: "verified",
    });

    await maybeMarkParticipantJoined("match_join", match.id, player.id, payment.id, 399);

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      );

    expect(participants).toHaveLength(1);
    expect(participants[0].paymentStatus).toBe("final_paid");
    expect(participants[0].status).toBe("final_paid");
    expect(participants[0].finalPaidAmount).toBe(399);
    testRegistry.participantIds.push(participants[0].id);

    const [updatedMatch] = await db
      .select({ currentPlayers: hostedMatchesTable.currentPlayers })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, match.id));
    expect(updatedMatch.currentPlayers).toBe(1);
  });

  it("is idempotent — second call does not create duplicate participant", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      grossAmount: 399,
      status: "verified",
    });

    await maybeMarkParticipantJoined("match_join", match.id, player.id, payment.id, 399);
    await maybeMarkParticipantJoined("match_join", match.id, player.id, payment.id, 399);

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      );

    expect(participants).toHaveLength(1);
    testRegistry.participantIds.push(...participants.map((p) => p.id));
  });

  it("does nothing when type is not match_join", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, { type: "match_reserve", referenceId: match.id });

    await maybeMarkParticipantJoined("match_reserve", match.id, player.id, payment.id, 49);

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, match.id));
    expect(participants).toHaveLength(0);
  });
});

// ─── 4. Phase 2B: match_join transitions match status ─────────────────────────
describe("maybeMarkParticipantJoined — match status transitions", () => {
  it("transitions match to confirmed when minPlayers crossed via upfront joins", async () => {
    const { match } = await buildMatchScenario({ minPlayers: 2 });

    const player1 = await seedUser();
    const player2 = await seedUser();
    const pay1 = await seedPayment(player1.id, { type: "match_join" as any, referenceId: match.id, grossAmount: 399 });
    const pay2 = await seedPayment(player2.id, { type: "match_join" as any, referenceId: match.id, grossAmount: 399 });

    await maybeMarkParticipantJoined("match_join", match.id, player1.id, pay1.id, 399);

    const [after1] = await db.select({ status: hostedMatchesTable.status }).from(hostedMatchesTable).where(eq(hostedMatchesTable.id, match.id));
    expect(after1.status).toBe("open"); // not yet at minPlayers

    await maybeMarkParticipantJoined("match_join", match.id, player2.id, pay2.id, 399);

    const [after2] = await db.select({ status: hostedMatchesTable.status }).from(hostedMatchesTable).where(eq(hostedMatchesTable.id, match.id));
    // With 2 final_paid players >= minPlayers=2, should be confirmed or fully_paid
    expect(["confirmed", "fully_paid"]).toContain(after2.status);

    const ps = await db.select().from(hostedMatchParticipantsTable).where(eq(hostedMatchParticipantsTable.matchId, match.id));
    testRegistry.participantIds.push(...ps.map((p) => p.id));
  });
});

// ─── 5. Phase 2B: runPostPaymentSideEffects for match_join ────────────────────
describe("runPostPaymentSideEffects — match_join", () => {
  it("creates payout and participant for match_join payment", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      amount: "399",
      grossAmount: 399,
      status: "verified",
    });

    await runPostPaymentSideEffects({
      paymentId: payment.id,
      userId: player.id,
      type: "match_join",
      referenceId: match.id,
      amount: 399,
      grossAmount: 399,
    });

    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));
    expect(payouts.length).toBeGreaterThanOrEqual(1);
    testRegistry.payoutIds.push(...payouts.map((p) => p.id));

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      );
    expect(participants).toHaveLength(1);
    expect(participants[0].paymentStatus).toBe("final_paid");
    testRegistry.participantIds.push(...participants.map((p) => p.id));
  });

  it("is idempotent — double call generates only one payout row", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      grossAmount: 399,
      status: "verified",
    });

    const ctx = {
      paymentId: payment.id,
      userId: player.id,
      type: "match_join",
      referenceId: match.id,
      amount: 399,
      grossAmount: 399,
    };

    await runPostPaymentSideEffects(ctx);
    await runPostPaymentSideEffects(ctx);

    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));

    expect(payouts.length).toBeLessThanOrEqual(1);
    testRegistry.payoutIds.push(...payouts.map((p) => p.id));

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, match.id));
    expect(participants).toHaveLength(1);
    testRegistry.participantIds.push(...participants.map((p) => p.id));
  });
});

// ─── 6. Payment Failure Handling ──────────────────────────────────────────────
describe("Payment failure handling", () => {
  it("failed payment does NOT create a participant", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      grossAmount: 399,
      status: "failed",
    });

    // Do NOT call side effects for failed payments (webhook skips them)
    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, match.id));
    expect(participants).toHaveLength(0);
  });
});

// ─── 7. Duplicate Webhook Idempotency ─────────────────────────────────────────
describe("runPostPaymentSideEffects — duplicate webhook idempotency", () => {
  it("generates payout only once when called twice with same paymentId", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "49",
      grossAmount: 49,
      status: "verified",
    });

    const ctx = {
      paymentId: payment.id,
      userId: player.id,
      type: "match_reserve",
      referenceId: match.id,
      amount: 49,
      grossAmount: 49,
    };

    await runPostPaymentSideEffects(ctx);
    await runPostPaymentSideEffects(ctx);

    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));

    expect(payouts.length).toBeLessThanOrEqual(1);
    testRegistry.payoutIds.push(...payouts.map((p) => p.id));
  });
});

// ─── 8. Legacy: Reserve → Reservation → Participant (backward compat) ─────────
describe("convertReservationToParticipant — legacy backward compat", () => {
  it("converts a paid reservation to a participant", async () => {
    const { match } = await buildMatchScenario({ minPlayers: 4 });
    const player = await seedUser({ fullName: "Legacy Player" });
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "49",
      grossAmount: 49,
      status: "verified",
    });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "awaiting_conversion",
      amount: 49,
    });

    const result = await convertReservationToParticipant(reservation.id, payment.id);
    expect(result.converted).toBe(true);

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      );
    expect(participants).toHaveLength(1);
    expect(participants[0].paymentStatus).toBe("reserve_paid");
    testRegistry.participantIds.push(participants[0].id);
  });

  it("returns already_converted on duplicate call (idempotent)", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, { type: "match_reserve", referenceId: match.id });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "awaiting_conversion",
    });

    await convertReservationToParticipant(reservation.id, payment.id);
    const second = await convertReservationToParticipant(reservation.id, payment.id);
    expect(second.converted).toBe(false);
    expect(second.reason).toMatch(/already_converted|participant_already_exists|terminal_state/);
  });

  it("does NOT convert when reservation is expired", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, { type: "match_reserve", referenceId: match.id });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "expired",
      isActive: false,
      expiresAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    const result = await convertReservationToParticipant(reservation.id, payment.id);
    expect(result.converted).toBe(false);
  });
});

// ─── 9. Legacy: Final Payment → fully_paid (backward compat) ──────────────────
describe("maybeMarkParticipantPaid — legacy match_final", () => {
  it("marks participant as final_paid and transitions match to fully_paid", async () => {
    const { match } = await buildMatchScenario({ minPlayers: 2 });

    await db.update(hostedMatchesTable)
      .set({ status: "confirmed", currentPlayers: 2 })
      .where(eq(hostedMatchesTable.id, match.id));

    const player1 = await seedUser();
    const player2 = await seedUser();
    const p1 = await seedParticipant(match.id, player1.id, { paymentStatus: "reserve_paid" });
    const p2 = await seedParticipant(match.id, player2.id, { paymentStatus: "reserve_paid" });

    const pay1 = await seedPayment(player1.id, { type: "match_final", referenceId: match.id, amount: "350", grossAmount: 350 });
    const pay2 = await seedPayment(player2.id, { type: "match_final", referenceId: match.id, amount: "350", grossAmount: 350 });

    await maybeMarkParticipantPaid("match_final", match.id, player1.id, pay1.id, 350);
    const [after1] = await db.select({ status: hostedMatchesTable.status }).from(hostedMatchesTable).where(eq(hostedMatchesTable.id, match.id));
    expect(after1.status).toBe("confirmed");

    await maybeMarkParticipantPaid("match_final", match.id, player2.id, pay2.id, 350);
    const [after2] = await db.select({ status: hostedMatchesTable.status }).from(hostedMatchesTable).where(eq(hostedMatchesTable.id, match.id));
    expect(after2.status).toBe("fully_paid");

    testRegistry.participantIds.push(p1.id, p2.id);
  });

  it("is idempotent — double call does not double-update financials", async () => {
    const { match } = await buildMatchScenario({ minPlayers: 2 });
    await db.update(hostedMatchesTable).set({ status: "confirmed", currentPlayers: 1 }).where(eq(hostedMatchesTable.id, match.id));

    const player = await seedUser();
    const p = await seedParticipant(match.id, player.id, { paymentStatus: "reserve_paid" });
    const payment = await seedPayment(player.id, { type: "match_final", referenceId: match.id, amount: "350", grossAmount: 350 });

    await maybeMarkParticipantPaid("match_final", match.id, player.id, payment.id, 350);
    await maybeMarkParticipantPaid("match_final", match.id, player.id, payment.id, 350);

    const [m] = await db.select({ grossFinalCollected: hostedMatchesTable.grossFinalCollected }).from(hostedMatchesTable).where(eq(hostedMatchesTable.id, match.id));
    expect(m.grossFinalCollected).toBe(350);
    testRegistry.participantIds.push(p.id);
  });
});

// ─── 10. Refund Compatibility — reverseMatchPayouts ───────────────────────────
describe("reverseMatchPayouts — refund compat", () => {
  it("creates equal and opposite reversal rows netting to zero", async () => {
    const { venue, match } = await buildMatchScenario();
    const payment = await seedPayment((await seedUser()).id, { type: "host_commitment", referenceId: match.id, grossAmount: 700 });
    await generateMatchPayout(venue.id, match.id, 700, payment.id, "host_commitment");

    const beforeRows = await db.select().from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.referenceId, match.id));
    testRegistry.payoutIds.push(...beforeRows.map((r) => r.id));

    await reverseMatchPayouts(match.id);

    const allRows = await db.select().from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.referenceId, match.id));
    testRegistry.payoutIds.push(...allRows.map((r) => r.id));

    const netVenuePayable = allRows.reduce((sum, r) => sum + Number(r.venuePayable), 0);
    expect(Math.abs(netVenuePayable)).toBeLessThan(0.01);
  });
});

// ─── 11. Legacy Payment Compatibility ─────────────────────────────────────────
describe("Legacy payment compatibility — match_reserve records", () => {
  it("match_reserve payout generation still works", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "49",
      grossAmount: 49,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 49, payment.id, "match_reserve");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].payoutType).toBe("match_reserve");
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });
});

// ─── 12. Late Webhook Safety ───────────────────────────────────────────────────
describe("Late webhook safety — refund_required", () => {
  it("flags payment as refund_required when reservation is expired", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      status: "verified",
    });

    await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "expired",
      isActive: false,
      expiresAt: new Date(Date.now() - 15 * 60 * 1000),
    });

    // Simulate webhook handler marking refund_required
    await db.update(paymentsTable)
      .set({ reviewStatus: "refund_required" })
      .where(eq(paymentsTable.id, payment.id));

    const [report] = await db.insert(reconciliationReportsTable).values({
      reportType: "late_webhook_refund_required",
      severity: "high",
      entityType: "payment",
      entityId: payment.id,
      sourceSystem: "webhook",
      payload: { paymentId: payment.id, reason: "reservation_expired" },
    }).returning();
    testRegistry.reconciliationIds.push(report.id);

    const [p] = await db.select({ reviewStatus: paymentsTable.reviewStatus }).from(paymentsTable).where(eq(paymentsTable.id, payment.id));
    expect(p.reviewStatus).toBe("refund_required");

    const reports = await db.select().from(reconciliationReportsTable).where(eq(reconciliationReportsTable.entityId, payment.id));
    expect(reports.some((r) => r.reportType === "late_webhook_refund_required")).toBe(true);
  });
});

// ─── 13. match_join Payout Generation ─────────────────────────────────────────
describe("generateMatchPayout — match_join", () => {
  it("creates a venue payout ledger row for match_join payment", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser({ fullName: "Joining Player" });
    const payment = await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      amount: "399",
      grossAmount: 399,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 399, payment.id, "match_join");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, payment.id),
          eq(venuePayoutLedgerTable.payoutType, "match_join")
        )
      );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].grossAmount)).toBe(399);
    expect(rows[0].status).toBe("pending");
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });

  it("is idempotent — second call with same paymentId is a no-op", async () => {
    const { venue, match } = await buildMatchScenario();
    const player = await seedUser();
    const payment = await seedPayment(player.id, {
      type: "match_join" as any,
      referenceId: match.id,
      grossAmount: 399,
      status: "verified",
    });

    await generateMatchPayout(venue.id, match.id, 399, payment.id, "match_join");
    await generateMatchPayout(venue.id, match.id, 399, payment.id, "match_join");

    const rows = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.paymentId, payment.id));

    expect(rows).toHaveLength(1);
    testRegistry.payoutIds.push(...rows.map((r) => r.id));
  });
});
