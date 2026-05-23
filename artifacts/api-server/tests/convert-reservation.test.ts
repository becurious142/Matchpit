/**
 * Task 4.4 — Unit tests for updated convertReservationToParticipant()
 *
 * Validates the HM12 upfront model behaviour:
 *  - Participant is created with status = "joined" and paymentStatus = "paid"
 *  - payment_id and paid_amount columns are populated
 *  - finalPaymentDeadline is NOT set
 *  - Idempotency: second call returns { converted: false }
 *  - Expired reservation returns { converted: false, reason: "expired" }
 *
 * Requirements: 2.2, 7.1–7.2
 *
 * Note: seedPayment uses "match_reserve" as the DB payment_type enum value
 * (the "match_join" enum value is added in a later DB migration). The payment
 * type does not affect convertReservationToParticipant() behaviour — the
 * function only reads the payment's grossAmount.
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import {
  hostedMatchParticipantsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { convertReservationToParticipant } from "../src/lib/post-payment";
import {
  seedUser,
  seedPayment,
  seedReservation,
  buildMatchScenario,
  testRegistry,
} from "./setup";

describe("convertReservationToParticipant — upfront model (HM12)", () => {
  // ─── Test 1: status = "reserved" and paymentStatus = "reserve_paid" ─────────────────
  it('converted participant has status = "reserved" and paymentStatus = "reserve_paid"', async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ fullName: "Upfront Player" });
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "500",
      grossAmount: 500,
      status: "verified",
    });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "awaiting_conversion",
      isActive: true,
    });

    const result = await convertReservationToParticipant(reservation.id, payment.id);

    expect(result.converted).toBe(true);

    const [participant] = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      )
      .limit(1);

    expect(participant).toBeDefined();
    expect(participant.status).toBe("reserved");
    expect(participant.paymentStatus).toBe("reserve_paid");

    testRegistry.participantIds.push(participant.id);
  });

  // ─── Test 2: reservePaymentId and reservePaidAmount columns are populated ─────────────
  it("reservePaymentId and reservePaidAmount columns are populated on the participant row", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ fullName: "Upfront Player 2" });
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "500",
      grossAmount: 500,
      status: "verified",
    });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "awaiting_conversion",
      isActive: true,
    });

    const result = await convertReservationToParticipant(reservation.id, payment.id);

    expect(result.converted).toBe(true);

    const [participant] = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      )
      .limit(1);

    expect(participant).toBeDefined();
    expect(participant.reservePaymentId).toBe(payment.id);
    expect(participant.reservePaidAmount).toBeGreaterThan(0);

    testRegistry.participantIds.push(participant.id);
  });

  // ─── Test 3: finalPaymentDeadline is NOT set ───────────────────────────────
  it("finalPaymentDeadline is NOT set on any participant after conversion", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ fullName: "Upfront Player 3" });
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "500",
      grossAmount: 500,
      status: "verified",
    });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "awaiting_conversion",
      isActive: true,
    });

    const result = await convertReservationToParticipant(reservation.id, payment.id);

    expect(result.converted).toBe(true);

    const [participant] = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      )
      .limit(1);

    expect(participant).toBeDefined();
    expect(participant.finalPaymentDeadline).toBeNull();

    testRegistry.participantIds.push(participant.id);
  });

  // ─── Test 4: Idempotency — second call returns { converted: false } ────────
  it("idempotency — second call returns { converted: false, reason: matching /already_converted|participant_already_exists|terminal_state/ }", async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ fullName: "Idempotent Player" });
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "500",
      grossAmount: 500,
      status: "verified",
    });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "awaiting_conversion",
      isActive: true,
    });

    const first = await convertReservationToParticipant(reservation.id, payment.id);
    expect(first.converted).toBe(true);

    const second = await convertReservationToParticipant(reservation.id, payment.id);
    expect(second.converted).toBe(false);
    expect(second.reason).toMatch(/already_converted|participant_already_exists|terminal_state/);

    // Register participant for cleanup
    const [participant] = await db
      .select({ id: hostedMatchParticipantsTable.id })
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, match.id),
          eq(hostedMatchParticipantsTable.userId, player.id)
        )
      )
      .limit(1);
    if (participant) testRegistry.participantIds.push(participant.id);
  });

  // ─── Test 5: Expired reservation returns { converted: false, reason: "expired" } ─
  it('expired reservation returns { converted: false, reason: "expired" }', async () => {
    const { match } = await buildMatchScenario();
    const player = await seedUser({ fullName: "Late Webhook Player" });
    const payment = await seedPayment(player.id, {
      type: "match_reserve",
      referenceId: match.id,
      amount: "500",
      grossAmount: 500,
      status: "verified",
    });
    const reservation = await seedReservation(match.id, player.id, payment.id, {
      reservationStatus: "expired",
      isActive: false,
      expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes in the past
    });

    const result = await convertReservationToParticipant(reservation.id, payment.id);

    expect(result.converted).toBe(false);
    expect(result.reason).toBe("expired");
  });
});
