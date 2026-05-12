import { db } from "@workspace/db";
import {
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  hostedMatchReservationsTable,
  paymentsTable,
  profilesTable,
  slotsTable,
  venuePayoutLedgerTable,
  reconciliationReportsTable,
} from "@workspace/db";
import { eq, and, lt, gt, inArray, isNull, ne } from "drizzle-orm";
import { processUnderfillRefund } from "./wallet";
import { reverseMatchPayouts } from "./payouts";
import { logger } from "./logger";

export interface CronResult {
  processed: number;
  errors: number;
  details: string[];
}

export async function processUnderfillCancellations(): Promise<CronResult> {
  const result: CronResult = { processed: 0, errors: 0, details: [] };
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const expiredOpenMatches = await db
    .select()
    .from(hostedMatchesTable)
    .where(
      and(
        eq(hostedMatchesTable.status, "open"),
        lt(hostedMatchesTable.date, todayStr),
      ),
    );

  const underfilled = expiredOpenMatches.filter(
    (m) => m.currentPlayers < m.minPlayers,
  );

  for (const match of underfilled) {
    try {
      if (match.underfillRefundIssued) {
        result.details.push(`Match ${match.id} already refunded — skipped`);
        continue;
      }

      const participants = await db
        .select()
        .from(hostedMatchParticipantsTable)
        .where(
          and(
            eq(hostedMatchParticipantsTable.matchId, match.id),
            inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"]),
          ),
        );

      await db
        .update(hostedMatchesTable)
        .set({
          status: "cancelled_underfilled",
          cancelledReason: `Match expired with only ${match.currentPlayers}/${match.minPlayers} minimum players`,
          underfillRefundIssued: true,
          refundExposure: 0,
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchesTable.id, match.id));

      await db
        .update(slotsTable)
        .set({ status: "available", updatedAt: new Date() })
        .where(eq(slotsTable.id, match.slotId));

      // PATCH 3 — Reverse payout ledger entries for cancelled underfilled match
      await reverseMatchPayouts(match.id);

      for (const participant of participants) {
        const refundAmount = (participant.reservePaidAmount || 0) + (participant.finalPaidAmount || 0);
        if (refundAmount > 0) {
          await processUnderfillRefund(participant.userId, match.id, refundAmount);
        }
        await db
          .update(hostedMatchParticipantsTable)
          .set({ status: "cancelled", paymentStatus: "refunded", updatedAt: new Date() })
          .where(eq(hostedMatchParticipantsTable.id, participant.id));
      }

      if (match.hostUserId) {
        if (match.grossHostCollected > 0) {
          await processUnderfillRefund(match.hostUserId, match.id, match.grossHostCollected);
        }
      }

      result.processed++;
      result.details.push(
        `Match ${match.id} cancelled (underfilled ${match.currentPlayers}/${match.minPlayers}), ${participants.length} refunded`,
      );
    } catch (err) {
      result.errors++;
      result.details.push(`Match ${match.id} failed: ${String(err)}`);
      logger.error({ err, matchId: match.id }, "Underfill cancellation error");
    }
  }

  logger.info(result, "processUnderfillCancellations complete");
  return result;
}

export async function dropUnpaidParticipants(): Promise<CronResult> {
  const result: CronResult = { processed: 0, errors: 0, details: [] };
  const now = new Date();

  const overdueParticipants = await db
    .select({
      participant: hostedMatchParticipantsTable,
      match: hostedMatchesTable,
    })
    .from(hostedMatchParticipantsTable)
    .innerJoin(
      hostedMatchesTable,
      eq(hostedMatchParticipantsTable.matchId, hostedMatchesTable.id),
    )
    .where(
      and(
        eq(hostedMatchParticipantsTable.status, "reserved"),
        eq(hostedMatchesTable.status, "confirmed"),
        lt(hostedMatchParticipantsTable.finalPaymentDeadline, now),
      ),
    );

  for (const { participant, match } of overdueParticipants) {
    try {
      await db
        .update(hostedMatchParticipantsTable)
        .set({
          status: "dropped_unpaid",
          droppedAt: new Date(),
          droppedReason: "Final payment deadline missed",
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchParticipantsTable.id, participant.id));

      await db
        .update(hostedMatchesTable)
        .set({
          currentPlayers: Math.max(0, match.currentPlayers - 1),
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchesTable.id, match.id));

      result.processed++;
      result.details.push(
        `Participant ${participant.userId} dropped from match ${match.id} (unpaid)`,
      );
    } catch (err) {
      result.errors++;
      result.details.push(`Participant ${participant.id} drop failed: ${String(err)}`);
      logger.error({ err, participantId: participant.id }, "Drop unpaid participant error");
    }
  }

  logger.info(result, "dropUnpaidParticipants complete");
  return result;
}

// HM8 FORENSIC PATCH — completion cron: transition confirmed/fully_paid matches to completed
export async function processCompletedMatches(): Promise<CronResult> {
  const result: CronResult = { processed: 0, errors: 0, details: [] };
  const now = new Date();
  
  // Find matches > 3 hours past their end time.
  // match.date is YYYY-MM-DD, match.endTime is HH:MM
  const candidateMatches = await db
    .select()
    .from(hostedMatchesTable)
    .where(
      inArray(hostedMatchesTable.status, ["confirmed", "fully_paid"])
    );

  for (const match of candidateMatches) {
    try {
      // Basic check: combine date + endTime (in UTC) and add 3 hours
      // match.date is YYYY-MM-DD, match.endTime is HH:MM in local venue timezone
      // Note: All match dates/times should be stored and compared in UTC or consistent timezone
      const matchEndStr = `${match.date}T${match.endTime}:00Z`; // Force UTC interpretation
      const matchEndDate = new Date(matchEndStr);
      
      // If parsing fails, skip
      if (isNaN(matchEndDate.getTime())) {
        continue;
      }

      const completedThreshold = new Date(matchEndDate.getTime() + 3 * 60 * 60 * 1000);

      if (now > completedThreshold) {
        // Transition match
        await db
          .update(hostedMatchesTable)
          .set({
            status: "completed",
            updatedAt: new Date(),
          })
          .where(eq(hostedMatchesTable.id, match.id));

        // Release slot (COMPLETED MATCH -> booked)
        await db
          .update(slotsTable)
          .set({ status: "booked", updatedAt: new Date() })
          .where(eq(slotsTable.id, match.slotId));

        // Mark payout rows ready_for_settlement
        await db
          .update(venuePayoutLedgerTable)
          .set({ status: "ready_for_settlement" })
          .where(
            and(
              eq(venuePayoutLedgerTable.referenceId, match.id),
              eq(venuePayoutLedgerTable.status, "pending")
            )
          );

        result.processed++;
        result.details.push(`Match ${match.id} marked completed`);
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Match ${match.id} completion failed: ${String(err)}`);
      logger.error({ err, matchId: match.id }, "Match completion error");
    }
  }

  logger.info(result, "processCompletedMatches complete");
  return result;
}

// ─── Reservation Cleanup Cron ──────────────────────────────────────────────────

/**
 * HM9 FORENSIC PATCH — releaseExpiredReservations
 *
 * Runs periodically to find reservations that exceeded MATCH_RESERVATION_TIMEOUT_MINUTES
 * and have not been paid.
 *
 * For each expired reservation:
 *  - Sets reservationStatus = 'expired'
 *  - Marks associated payment as 'expired'
 *
 * Late-webhook safety: if Razorpay webhook arrives AFTER expiry, the webhook
 * handler checks reservationStatus === 'expired' and routes to 'refund_required'.
 */
export async function releaseExpiredReservations(): Promise<CronResult> {
  const result: CronResult = { processed: 0, errors: 0, details: [] };
  const now = new Date();

  const expiredReservations = await db
    .select()
    .from(hostedMatchReservationsTable)
    .where(
      and(
        eq(hostedMatchReservationsTable.reservationStatus, "pending_payment"),
        lt(hostedMatchReservationsTable.expiresAt, now)
      )
    );

  logger.info({ count: expiredReservations.length }, "HM9: releaseExpiredReservations — found expired");

  for (const reservation of expiredReservations) {
    try {
      await db.transaction(async (tx) => {
        // Mark reservation expired
        await tx
          .update(hostedMatchReservationsTable)
          .set({ reservationStatus: "expired", updatedAt: new Date() })
          .where(eq(hostedMatchReservationsTable.id, reservation.id));

        // Expire associated payment order if it's still pending
        if (reservation.paymentOrderId) {
          await tx
            .update(paymentsTable)
            .set({ status: "expired", updatedAt: new Date() })
            .where(
              and(
                eq(paymentsTable.razorpayOrderId, reservation.paymentOrderId),
                eq(paymentsTable.status, "payment_initiated")
              )
            );
        }
      });

      result.processed++;
      result.details.push(`Reservation ${reservation.id} expired (match: ${reservation.matchId})`);
    } catch (err) {
      result.errors++;
      result.details.push(`Reservation ${reservation.id} expiry failed: ${String(err)}`);
      logger.error({ err, reservationId: reservation.id }, "HM9: reservation expiry error");
    }
  }

  logger.info(result, "HM9: releaseExpiredReservations complete");
  return result;
}

// ─── Reconciliation Cron ──────────────────────────────────────────────────────

/**
 * HM10 PATCH 10 — Reconciliation Job Engine
 *
 * Audit-only cron that detects financial inconsistencies.
 * Does NOT mutate money. Writes discrepancies to reconciliationReportsTable.
 */
export async function reconcileHostedMatchPayments(): Promise<CronResult> {
  const result: CronResult = { processed: 0, errors: 0, details: [] };
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    // ── Class A: Orphan Payment No Reservation ─────────────────────────────────────
    // A captured payment for a match with no associated active reservation or participant
    const capturedMatchPayments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          inArray(paymentsTable.status, ["verified", "payment_captured", "success"]),
          inArray(paymentsTable.type, ["host_commitment", "match_reserve", "match_final"]),
          gt(paymentsTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)) // look back 24h
        )
      );

    for (const payment of capturedMatchPayments) {
      try {
        const [reservation] = await db
          .select({ id: hostedMatchReservationsTable.id })
          .from(hostedMatchReservationsTable)
          .where(eq(hostedMatchReservationsTable.paymentId, payment.id))
          .limit(1);

        if (!reservation) {
          await db.insert(reconciliationReportsTable).values({
            reportType: "orphan_payment_no_reservation",
            severity: "critical",
            entityType: "payment",
            entityId: payment.id,
            sourceSystem: "reconciliation_cron",
            payload: { paymentId: payment.id, orderId: payment.razorpayOrderId, amount: payment.amount }
          });
          result.processed++;
          result.details.push(`ORPHAN PAYMENT: ${payment.id} has no reservation`);
        }
      } catch (e) {
        result.errors++;
        logger.error({ err: e, paymentId: payment.id }, "Recon failed: orphan_payment_no_reservation");
      }
    }

    // ── Class B: Orphan Reservation No Participant ───────────────────────────────
    // Reservation is converted but participant ID is null
    const ghostReservations = await db
      .select()
      .from(hostedMatchReservationsTable)
      .where(
        and(
          eq(hostedMatchReservationsTable.reservationStatus, "converted"),
          isNull(hostedMatchReservationsTable.convertedParticipantId)
        )
      );

    for (const res of ghostReservations) {
      await db.insert(reconciliationReportsTable).values({
        reportType: "orphan_reservation_no_participant",
        severity: "critical",
        entityType: "reservation",
        entityId: res.id,
        sourceSystem: "reconciliation_cron",
        payload: { reservationId: res.id, matchId: res.matchId, paymentId: res.paymentId }
      });
      result.processed++;
      result.details.push(`GHOST RESERVATION: ${res.id} missing participant link`);
    }

    // ── Class C: Orphan Participant No Payout ────────────────────────────────────
    // Participant is confirmed but no ledger entry exists
    const paidParticipants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"]));

    for (const p of paidParticipants) {
      // HM11: Determine which payment ID to check based on paymentStatus
      const paymentId = p.paymentStatus === "final_paid" ? p.finalPaymentId : p.reservePaymentId;
      
      if (!paymentId) continue; // Skip if no payment ID available
      
      const [payout] = await db
        .select({ id: venuePayoutLedgerTable.id })
        .from(venuePayoutLedgerTable)
        .where(eq(venuePayoutLedgerTable.paymentId, paymentId))
        .limit(1);

      if (!payout) {
        await db.insert(reconciliationReportsTable).values({
          reportType: "orphan_participant_no_payout",
          severity: "high",
          entityType: "participant",
          entityId: p.id,
          sourceSystem: "reconciliation_cron",
          payload: { participantId: p.id, matchId: p.matchId, paymentId }
        });
        result.processed++;
        result.details.push(`ORPHAN PARTICIPANT: ${p.id} missing payout ledger entry`);
      }
    }

    // ── Class D: Orphan Payout No Payment ────────────────────────────────────────
    // Payout row exists without a payment link (unless reversal or old data)
    const orphanPayouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(
        and(
          inArray(venuePayoutLedgerTable.referenceType, ["hosted_match", "match_reserve", "match_final"]),
          isNull(venuePayoutLedgerTable.paymentId),
          ne(venuePayoutLedgerTable.payoutType, "reversal")
        )
      );

    for (const payout of orphanPayouts) {
      await db.insert(reconciliationReportsTable).values({
        reportType: "orphan_payout_no_payment",
        severity: "high",
        entityType: "payout",
        entityId: payout.id,
        sourceSystem: "reconciliation_cron",
        payload: { payoutId: payout.id, amount: payout.grossAmount }
      });
      result.processed++;
    }

    // ── Check: Stale Pending Payments ──────────────────────────────────────
    const stalePayments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          inArray(paymentsTable.status, ["pending", "payment_initiated"]),
          lt(paymentsTable.createdAt, oneHourAgo)
        )
      );

    for (const payment of stalePayments) {
      try {
        await db.insert(reconciliationReportsTable).values({
          reportType: "stale_pending_payment",
          severity: "medium",
          entityType: "payment",
          entityId: payment.id,
          sourceSystem: "reconciliation_cron",
          payload: { paymentId: payment.id, ageMinutes: Math.round((Date.now() - payment.createdAt.getTime()) / 60000) }
        });
        result.processed++;
      } catch (err) {
        result.errors++;
        logger.error({ err, paymentId: payment.id }, "HM10: stale payment report insert failed");
      }
    }

    logger.info(result, "HM10: reconcileHostedMatchPayments complete");
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "HM10: reconcileHostedMatchPayments fatal error");
    result.errors++;
    result.details.push(`FATAL ERROR: ${errorMsg}`);
    return result;
  }
}
