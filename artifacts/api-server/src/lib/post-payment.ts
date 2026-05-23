/**
 * HM9A — Shared post-payment side effect engine.
 *
 * This module is the SINGLE source of truth for all post-payment actions:
 * - Marking participants as paid (final payment)
 * - Marking participants as upfront_paid (Phase 2B match_join)
 * - Generating venue payout ledger entries
 * - Processing referral/cashback rewards
 * - Sending notifications
 * - Tracking analytics events
 *
 * Both /payments/verify (UX fallback) and /payments/webhook (canonical authority)
 * call this module so side effects are NEVER duplicated or missed.
 *
 * Every function here must be IDEMPOTENT — safe to call multiple times.
 *
 * PHASE 2B: match_join payment type is added. When ENABLE_UPFRONT_MODEL is
 * true, players pay the full amount at join time. The webhook and verify paths
 * call maybeMarkParticipantJoined instead of convertReservationToParticipant.
 */

import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  hostedMatchReservationsTable,
  bookingsTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { FinancialLedgerService } from "./ledger";
import {
  processReferralRewards,
  processFirstBookingCashback,
  processFirstMatchCashback,
} from "./wallet";
import { generateBookingPayout, generateMatchPayout } from "./payouts";
import { createNotification } from "./notifications";
import { trackEvent, EVENTS } from "./analytics";
import { logger } from "./logger";

// ─── Reservation Constants ────────────────────────────────────────────────────────────────────────────────
export const MATCH_RESERVATION_TIMEOUT_MINUTES = 7;
export const FINAL_PAYMENT_DEADLINE_HOURS = 6;

// ─── Participant Finalization ─────────────────────────────────────────────────

/**
 * HM9 FORENSIC: maybeMarkParticipantPaid
 *
 * For match_final payments, atomically:
 * - Marks participant as final_paid
 * - Updates match financials
 * - Transitions match to fully_paid if all participants have paid
 *
 * Idempotent: safe to call even if already finalized.
 */
export async function maybeMarkParticipantPaid(
  type: string,
  referenceId: string | null,
  userId: string,
  paymentId?: string,
  amount?: number
): Promise<void> {
  if (type !== "match_final" || !referenceId || !paymentId || amount === undefined) return;

  await db.transaction(async (tx) => {
    // HM10: Lock the match row FIRST to prevent concurrent financial mutations
    const [match] = await tx
      .select({ id: hostedMatchesTable.id })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, referenceId))
      .for("update")
      .limit(1);
    
    if (!match) return; // Match doesn't exist, nothing to do

    // Lock the participant row to prevent concurrent double-finalization
    const [participant] = await tx
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, referenceId),
          eq(hostedMatchParticipantsTable.userId, userId)
        )
      )
      .for("update")
      .limit(1);

    // Idempotency: already finalized
    if (!participant || participant.paymentStatus === "final_paid") return;

    await tx
      .update(hostedMatchParticipantsTable)
      .set({
        status: "final_paid",
        finalPaymentId: paymentId,
        finalPaidAmount: amount,
        paymentStatus: "final_paid",
        updatedAt: new Date(),
      })
      .where(eq(hostedMatchParticipantsTable.id, participant.id));

    await tx
      .update(hostedMatchesTable)
      .set({
        grossFinalCollected: sql`${hostedMatchesTable.grossFinalCollected} + ${amount}`,
        totalCollected: sql`${hostedMatchesTable.totalCollected} + ${amount}`,
        refundExposure: sql`${hostedMatchesTable.refundExposure} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(hostedMatchesTable.id, referenceId));

    // HM8/HM9: Transition to fully_paid if all participants have paid
    const participants = await tx
      .select({ paymentStatus: hostedMatchParticipantsTable.paymentStatus })
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, referenceId),
          inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"])
        )
      );

    const totalReservedOrFinal = participants.length;
    const totalFinalPaid = participants.filter((p) => p.paymentStatus === "final_paid").length;

    if (totalReservedOrFinal > 0 && totalReservedOrFinal === totalFinalPaid) {
      await tx
        .update(hostedMatchesTable)
        .set({ status: "fully_paid", updatedAt: new Date() })
        .where(
          and(
            eq(hostedMatchesTable.id, referenceId),
            inArray(hostedMatchesTable.status, ["confirmed"])
          )
        );
    }
  });
}

// ─── Reservation Conversion ───────────────────────────────────────────────────────────────────────────────

// ─── Phase 2B: Upfront Join Participant Creation ───────────────────────────────────────────────────

/**
 * PHASE 2B: maybeMarkParticipantJoined
 *
 * For match_join payments (full upfront), atomically:
 * - Creates a confirmed participant record with status 'upfront_paid'
 * - Updates match financials (grossFinalCollected, totalCollected)
 * - Increments currentPlayers and transitions match to 'confirmed' if threshold
 *
 * Idempotent: safe to call even if participant already exists.
 *
 * NOTE: This replaces the two-step convertReservationToParticipant +
 * maybeMarkParticipantPaid sequence for the upfront model.
 */
export async function maybeMarkParticipantJoined(
  type: string,
  referenceId: string | null,
  userId: string,
  paymentId?: string,
  amount?: number
): Promise<void> {
  if (type !== "match_join" || !referenceId || !paymentId || amount === undefined) return;

  await db.transaction(async (tx) => {
    // Lock match row to prevent concurrent financial mutations
    const [match] = await tx
      .select({
        id: hostedMatchesTable.id,
        status: hostedMatchesTable.status,
        currentPlayers: hostedMatchesTable.currentPlayers,
        minPlayers: hostedMatchesTable.minPlayers,
      })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, referenceId))
      .for("update")
      .limit(1);

    if (!match) return; // Match doesn't exist, nothing to do
    if (["cancelled", "completed"].includes(match.status)) return;

    // Idempotency: check if participant already exists
    const [existingParticipant] = await tx
      .select({ id: hostedMatchParticipantsTable.id, paymentStatus: hostedMatchParticipantsTable.paymentStatus })
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, referenceId),
          eq(hostedMatchParticipantsTable.userId, userId)
        )
      )
      .for("update")
      .limit(1);

    if (existingParticipant) {
      // Already joined — idempotent no-op
      return;
    }

    // Create confirmed participant with full upfront payment
    await tx
      .insert(hostedMatchParticipantsTable)
      .values({
        matchId: referenceId,
        userId,
        status: "final_paid",
        paymentStatus: "final_paid",
        reservePaymentId: paymentId,    // Reuse reservePaymentId for the upfront payment
        finalPaymentId: paymentId,
        reservePaidAmount: amount,       // Full amount stored as reserve for compatibility
        finalPaidAmount: amount,
      });

    // Update match financials
    const newCount = match.currentPlayers + 1;
    const nowBecomesConfirmed = newCount >= match.minPlayers && match.status === "open";

    await tx
      .update(hostedMatchesTable)
      .set({
        currentPlayers: newCount,
        status: newCount >= match.minPlayers ? "confirmed" : match.status,
        grossFinalCollected: sql`${hostedMatchesTable.grossFinalCollected} + ${amount}`,
        totalCollected: sql`${hostedMatchesTable.totalCollected} + ${amount}`,
        refundExposure: sql`${hostedMatchesTable.refundExposure} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(hostedMatchesTable.id, referenceId));

    // When match first becomes confirmed, check if all participants are upfront_paid
    // (in upfront model they are, so transition immediately to fully_paid if applicable)
    if (nowBecomesConfirmed) {
      // All participants in upfront model are already final_paid
      const allParticipants = await tx
        .select({ paymentStatus: hostedMatchParticipantsTable.paymentStatus })
        .from(hostedMatchParticipantsTable)
        .where(
          and(
            eq(hostedMatchParticipantsTable.matchId, referenceId),
            eq(hostedMatchParticipantsTable.paymentStatus, "final_paid")
          )
        );

      if (allParticipants.length >= match.minPlayers) {
        await tx
          .update(hostedMatchesTable)
          .set({ status: "fully_paid", updatedAt: new Date() })
          .where(eq(hostedMatchesTable.id, referenceId));
      }
    }
  });
}


/**
 * HM9 FORENSIC: convertReservationToParticipant
 *
 * Atomically converts a paid reservation to a confirmed participant.
 * Called after webhook confirms payment is captured.
 *
 * Late-webhook safety:
 * - If reservation is expired, does NOT create participant.
 * - If match is cancelled, does NOT create participant.
 * - If participant already exists, noops (idempotent).
 */
export async function convertReservationToParticipant(
  reservationId: string,
  paymentId: string
): Promise<{ converted: boolean; reason?: string }> {
  return await db.transaction(async (tx) => {
    // HM10 PATCH 3: Lock reservation row
    const [reservation] = await tx
      .select()
      .from(hostedMatchReservationsTable)
      .where(eq(hostedMatchReservationsTable.id, reservationId))
      .for("update")
      .limit(1);

    if (!reservation) return { converted: false, reason: "reservation_not_found" };
    if (reservation.reservationStatus === "converted") return { converted: false, reason: "already_converted" };
    if (reservation.reservationStatus === "expired") return { converted: false, reason: "expired" };
    if (reservation.reservationStatus === "cancelled") return { converted: false, reason: "cancelled" };
    if (!reservation.isActive) return { converted: false, reason: "terminal_state" };

    // HM10 PATCH 3: Lock match row simultaneously to protect aggregate mutations
    const [match] = await tx
      .select({ 
        status: hostedMatchesTable.status,
        currentPlayers: hostedMatchesTable.currentPlayers,
        minPlayers: hostedMatchesTable.minPlayers
      })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, reservation.matchId))
      .for("update")
      .limit(1);

    if (!match || ["cancelled", "completed"].includes(match.status)) {
      return { converted: false, reason: "match_not_active" };
    }

    // Idempotency: Check for existing participant
    const [existingParticipant] = await tx
      .select({ id: hostedMatchParticipantsTable.id })
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, reservation.matchId),
          eq(hostedMatchParticipantsTable.userId, reservation.userId)
        )
      )
      .limit(1);

    if (existingParticipant) {
      // Mark reservation converted (terminal state) and return
      await tx
        .update(hostedMatchReservationsTable)
        .set({
          reservationStatus: "converted",
          isActive: false,
          convertedParticipantId: existingParticipant.id,
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchReservationsTable.id, reservationId));
      return { converted: false, reason: "participant_already_exists" };
    }

    // Create the confirmed participant
    const [newParticipant] = await tx
      .insert(hostedMatchParticipantsTable)
      .values({
        matchId: reservation.matchId,
        userId: reservation.userId,
        reservePaymentId: paymentId,
        reservePaidAmount: 0, // Amount will be updated from payment record after lookup
        status: "reserved",
        paymentStatus: "reserve_paid",
      })
      .returning({ id: hostedMatchParticipantsTable.id });

    // Mark reservation as converted (terminal state)
    await tx
      .update(hostedMatchReservationsTable)
      .set({
        reservationStatus: "converted",
        isActive: false,
        convertedParticipantId: newParticipant!.id,
        paymentId,
        updatedAt: new Date(),
      })
      .where(eq(hostedMatchReservationsTable.id, reservationId));

    // Lookup payment to get actual amount
    const [payment] = await tx
      .select({ amount: paymentsTable.amount, grossAmount: paymentsTable.grossAmount })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);
    const reserveAmount = payment ? Number(payment.grossAmount || payment.amount || 0) : 0;

    // Update participant with actual paid amount
    await tx
      .update(hostedMatchParticipantsTable)
      .set({ reservePaidAmount: reserveAmount })
      .where(eq(hostedMatchParticipantsTable.id, newParticipant.id));

    // Increment player count and finance
    const newCount = match.currentPlayers + 1;
    const nowBecomesConfirmed = newCount >= match.minPlayers && match.status === "open";
    
    await tx
      .update(hostedMatchesTable)
      .set({
        currentPlayers: newCount,
        status: newCount >= match.minPlayers ? "confirmed" : "open",
        grossReserveCollected: sql`${hostedMatchesTable.grossReserveCollected} + ${reserveAmount}`,
        totalCollected: sql`${hostedMatchesTable.totalCollected} + ${reserveAmount}`,
        refundExposure: sql`${hostedMatchesTable.refundExposure} + ${reserveAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(hostedMatchesTable.id, reservation.matchId));

    // Assign finalPaymentDeadline to all reserved participants when match first becomes confirmed
    if (nowBecomesConfirmed) {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + FINAL_PAYMENT_DEADLINE_HOURS); 
      await tx
        .update(hostedMatchParticipantsTable)
        .set({ finalPaymentDeadline: deadline, updatedAt: new Date() })
        .where(
          and(
            eq(hostedMatchParticipantsTable.matchId, reservation.matchId),
            eq(hostedMatchParticipantsTable.paymentStatus, "reserve_paid"),
          ),
        );
    }

    return { converted: true };
  });
}

// ─── Post-Payment Side Effects ──────────────────────────────────────────────────────────────────────────────

export interface PostPaymentContext {
  paymentId: string;
  userId: string;
  type: string;
  referenceId: string | null;
  amount: number;
  grossAmount: number;
}

/**
 * HM9 FORENSIC: runPostPaymentSideEffects
 *
 * Executes all commerce side effects after a payment is confirmed.
 * Each step is individually try-caught so one failure doesn't abort others.
 * Idempotent: generateMatchPayout and generateBookingPayout use idempotency keys.
 */
export async function runPostPaymentSideEffects(ctx: PostPaymentContext): Promise<void> {
  const { paymentId, userId, type, referenceId, amount, grossAmount } = ctx;

  // Step 0: Record Double-Entry Inflow
  if (amount > 0) {
    try {
      await FinancialLedgerService.transfer(
        "liability_user_wallet", // Dummy placeholder: we'll record it differently below.
        "asset_cash_razorpay", // Actually: User pays Razorpay -> Razorpay holds money
        0, // we won't use transfer, we'll write raw entries
        {
          referenceType: "payment",
          referenceId: paymentId,
          description: "Razorpay payment success",
        }
      );
      // Let's explicitly record this transaction:
      // Debit Asset (Razorpay), Credit Liability/Revenue
      let creditAccount: typeof import("@workspace/db").ledgerAccountEnum.enumValues[number] = "liability_user_wallet";
      if (type === "booking") creditAccount = "liability_venue_payout";
      else if (type === "host_commitment" || type === "match_reserve" || type === "match_final" || type === "match_join") creditAccount = "liability_host_payout";

      await FinancialLedgerService.recordTransaction([
        { accountId: "asset_cash_razorpay", amount, type: "debit" }, // money in
        { accountId: creditAccount, amount, type: "credit" } // liability created
      ], {
        entityId: userId,
        referenceType: "payment",
        referenceId: paymentId,
        description: `Payment success for ${type}`,
      });
    } catch (err) {
      logger.error({ err, paymentId }, "Failed to record Razorpay inflow in financial ledger");
    }
  }

  // Step 1: Finalize participant based on payment type
  // Phase 2B: match_join triggers upfront participant creation
  if (type === "match_join") {
    await maybeMarkParticipantJoined(type, referenceId, userId, paymentId, grossAmount);
  } else {
    // Legacy: match_final marks existing participant as final_paid
    await maybeMarkParticipantPaid(type, referenceId, userId, paymentId, grossAmount);
  }

  // Step 2: Payout + cashback + referrals
  if (type === "booking" && referenceId) {
    try {
      const [booking] = await db
        .select({ venueId: bookingsTable.venueId })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, referenceId))
        .limit(1);
      if (booking) await generateBookingPayout(booking.venueId, referenceId, amount);
      await processFirstBookingCashback(userId, referenceId);
      await processReferralRewards(userId);
    } catch (err) {
      logger.error({ err, paymentId, type }, "post-payment: booking side effects failed");
    }
  }

  if (type === "host_commitment" && referenceId) {
    try {
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) await generateMatchPayout(match.venueId, referenceId, amount, paymentId, "host_commitment");
      await processFirstMatchCashback(userId, referenceId);
      await processReferralRewards(userId);
    } catch (err) {
      logger.error({ err, paymentId, type }, "post-payment: host_commitment side effects failed");
    }
  }

  if (type === "match_join" && referenceId) {
    try {
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId, reserveFee: hostedMatchesTable.reserveFee, finalFeePerPlayer: hostedMatchesTable.finalFeePerPlayer })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) await generateMatchPayout(match.venueId, referenceId, grossAmount, paymentId, "match_join");
      await processFirstMatchCashback(userId, referenceId);
      await processReferralRewards(userId);
    } catch (err) {
      logger.error({ err, paymentId, type }, "post-payment: match_join side effects failed");
    }
  }

  if (type === "match_reserve" && referenceId) {
    try {
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId, reserveFee: hostedMatchesTable.reserveFee })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) await generateMatchPayout(match.venueId, referenceId, Number(match.reserveFee), paymentId, "match_reserve");
      await processReferralRewards(userId);
    } catch (err) {
      logger.error({ err, paymentId, type }, "post-payment: match_reserve side effects failed");
    }
  }

  if (type === "match_final" && referenceId) {
    try {
      const [match] = await db
        .select({ venueId: hostedMatchesTable.venueId, finalFeePerPlayer: hostedMatchesTable.finalFeePerPlayer })
        .from(hostedMatchesTable)
        .where(eq(hostedMatchesTable.id, referenceId))
        .limit(1);
      if (match) await generateMatchPayout(match.venueId, referenceId, Number(match.finalFeePerPlayer), paymentId, "match_final");
    } catch (err) {
      logger.error({ err, paymentId, type }, "post-payment: match_final side effects failed");
    }
  }

  // Step 3: Analytics (non-fatal)
  try {
    const event =
      type === "booking" ? EVENTS.BOOKING_PAID :
      type === "host_commitment" ? EVENTS.HOST_MATCH_PAID :
      type === "match_reserve" ? EVENTS.RESERVE_JOIN_PAID :
      type === "match_final" ? EVENTS.FINAL_PAYMENT_PAID :
      type === "match_join" ? EVENTS.RESERVE_JOIN_PAID :   // reuse nearest event for upfront
      null;
    if (event) await trackEvent(event, userId, { referenceId, amount });
  } catch (err) {
    logger.warn({ err, paymentId }, "post-payment: analytics tracking failed");
  }

  // Step 4: Notifications (non-fatal)
  try {
    const notifMap: Record<string, { title: string; body: string }> = {
      booking: { title: "Booking Confirmed!", body: "Your turf booking is confirmed. Check your dashboard." },
      host_commitment: { title: "Match Created!", body: "Your hosted match is live. Share it to fill up your squad!" },
      match_reserve: { title: "Spot Reserved!", body: "You've secured your spot. Final payment due when the match is confirmed." },
      match_final: { title: "Final Payment Done!", body: "You're fully paid. See you on the pitch!" },
      // Phase 2B: upfront full payment
      match_join: { title: "You're In!", body: "Full payment received. Your spot is secured — see you on the pitch!" },
    };
    const notif = notifMap[type];
    if (notif && referenceId) {
      await createNotification({
        userId,
        type: "payment_success",
        title: notif.title,
        body: notif.body,
        referenceId,
      });
    }
  } catch (err) {
    logger.warn({ err, paymentId }, "post-payment: notification failed");
  }
}
