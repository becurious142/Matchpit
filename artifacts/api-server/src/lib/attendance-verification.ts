/**
 * Phase 3: Attendance Verification Engine
 *
 * Core business logic for the attendance verification workflow.
 * All state mutations use row-level locks (SELECT FOR UPDATE) to prevent
 * concurrent quorum races. Every operation is fully idempotent.
 *
 * Quorum rule:
 *   host confirmation (1) + max(2, ceil(50% of paid participants)) player confirmations
 *
 * Timeline:
 *   T=0           Match ends
 *   T+0 to T+48h  Verification window — host/players submit confirmations
 *   T+quorum      Quorum reached → match becomes "completed", settlementReleasesAt = now+24h
 *   T+quorum+24h  Cron releases payouts (ready_for_settlement)
 *   T+48h         Grace expired without quorum → match becomes "disputed"
 */

import { db } from "@workspace/db";
import {
  matchAttendanceConfirmationsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  venuePayoutLedgerTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, count, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  ENABLE_ATTENDANCE_VERIFICATION,
  ATTENDANCE_GRACE_PERIOD_HOURS,
  SETTLEMENT_HOLD_HOURS,
  calculatePlayerQuorum,
} from "./financial-config";
import { enqueueRiskEvaluation } from "./risk-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuorumStatus {
  matchId: string;
  totalPaidParticipants: number;
  requiredPlayerConfirmations: number;
  hostConfirmed: boolean;
  playerConfirmationsReceived: number;
  quorumReached: boolean;
  verificationDeadline: Date | null;
  settlementReleasesAt: Date | null;
  matchStatus: string;
}

export type VerifyAttendanceResult =
  | { outcome: "confirmed"; quorumReached: boolean; quorumStatus: QuorumStatus }
  | { outcome: "already_confirmed" }
  | { outcome: "feature_disabled" }
  | { outcome: "match_not_eligible"; reason: string }
  | { outcome: "not_authorized"; reason: string };

export type DisputeResult =
  | { outcome: "disputed" }
  | { outcome: "already_disputed" }
  | { outcome: "not_eligible"; reason: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the match end datetime from a match record.
 * match.date = "YYYY-MM-DD", match.endTime = "HH:MM" (stored as UTC)
 */
function matchEndDate(match: { date: string; endTime: string }): Date {
  return new Date(`${match.date}T${match.endTime}:00Z`);
}

/**
 * Return true if the match has ended (now > match end time).
 */
function hasMatchEnded(match: { date: string; endTime: string }): boolean {
  return new Date() > matchEndDate(match);
}

/**
 * Return true if the verification grace period has expired.
 */
function isGracePeriodExpired(verificationDeadline: Date | null): boolean {
  if (!verificationDeadline) return false;
  return new Date() > verificationDeadline;
}

// ─── Quorum Query ─────────────────────────────────────────────────────────────

/**
 * Fetch a live quorum status for a match.
 * Reads confirmation counts from the DB without locking (read-only).
 */
export async function getQuorumStatus(matchId: string): Promise<QuorumStatus | null> {
  const [match] = await db
    .select()
    .from(hostedMatchesTable)
    .where(eq(hostedMatchesTable.id, matchId))
    .limit(1);

  if (!match) return null;

  // Count paid participants (the denominator for quorum)
  const [{ value: totalPaid }] = await db
    .select({ value: count() })
    .from(hostedMatchParticipantsTable)
    .where(
      and(
        eq(hostedMatchParticipantsTable.matchId, matchId),
        inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"])
      )
    );

  const totalPaidParticipants = Number(totalPaid);
  const requiredPlayerConfirmations = calculatePlayerQuorum(totalPaidParticipants);

  // Count host confirmation
  const [{ value: hostCount }] = await db
    .select({ value: count() })
    .from(matchAttendanceConfirmationsTable)
    .where(
      and(
        eq(matchAttendanceConfirmationsTable.matchId, matchId),
        eq(matchAttendanceConfirmationsTable.role, "host"),
        eq(matchAttendanceConfirmationsTable.status, "confirmed")
      )
    );

  // Count player confirmations
  const [{ value: playerCount }] = await db
    .select({ value: count() })
    .from(matchAttendanceConfirmationsTable)
    .where(
      and(
        eq(matchAttendanceConfirmationsTable.matchId, matchId),
        eq(matchAttendanceConfirmationsTable.role, "player"),
        eq(matchAttendanceConfirmationsTable.status, "confirmed")
      )
    );

  const hostConfirmed = Number(hostCount) >= 1;
  const playerConfirmationsReceived = Number(playerCount);
  const quorumReached =
    hostConfirmed && playerConfirmationsReceived >= requiredPlayerConfirmations;

  return {
    matchId,
    totalPaidParticipants,
    requiredPlayerConfirmations,
    hostConfirmed,
    playerConfirmationsReceived,
    quorumReached,
    verificationDeadline: match.verificationDeadline ?? null,
    settlementReleasesAt: match.settlementReleasesAt ?? null,
    matchStatus: match.status,
  };
}

// ─── Host Verification ────────────────────────────────────────────────────────

/**
 * Host confirms that the match took place.
 *
 * Effects:
 *  1. Upserts a host confirmation row (idempotent).
 *  2. Transitions match → pending_verification (if still open/confirmed/fully_paid).
 *  3. Sets verificationDeadline = now + 48h (once).
 *  4. Checks quorum — if met, transitions to completed and schedules settlement.
 */
export async function verifyAttendanceAsHost(
  matchId: string,
  hostUserId: string
): Promise<VerifyAttendanceResult> {
  if (!ENABLE_ATTENDANCE_VERIFICATION) {
    return { outcome: "feature_disabled" };
  }

  return db.transaction(async (tx) => {
    // Lock the match row
    const [match] = await tx
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .for("update")
      .limit(1);

    if (!match) {
      return { outcome: "match_not_eligible", reason: "Match not found" };
    }

    if (match.hostUserId !== hostUserId) {
      return { outcome: "not_authorized", reason: "Only the host can verify attendance" };
    }

    if (!hasMatchEnded(match)) {
      return { outcome: "match_not_eligible", reason: "Match has not ended yet" };
    }

    const ineligibleStatuses = ["completed", "disputed", "cancelled", "cancelled_underfilled", "expired"];
    if (ineligibleStatuses.includes(match.status)) {
      return { outcome: "match_not_eligible", reason: `Match is already ${match.status}` };
    }

    // Idempotency: check if host already confirmed
    const [existing] = await tx
      .select()
      .from(matchAttendanceConfirmationsTable)
      .where(
        and(
          eq(matchAttendanceConfirmationsTable.matchId, matchId),
          eq(matchAttendanceConfirmationsTable.userId, hostUserId),
          eq(matchAttendanceConfirmationsTable.role, "host")
        )
      )
      .limit(1);

    if (existing?.status === "confirmed") {
      return { outcome: "already_confirmed" };
    }

    const now = new Date();

    // Insert or update confirmation row
    if (existing) {
      await tx
        .update(matchAttendanceConfirmationsTable)
        .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
        .where(eq(matchAttendanceConfirmationsTable.id, existing.id));
    } else {
      await tx.insert(matchAttendanceConfirmationsTable).values({
        matchId,
        participantId: null,
        userId: hostUserId,
        role: "host",
        status: "confirmed",
        confirmedAt: now,
      });
    }

    // Transition to pending_verification and set deadline (once)
    const verificationDeadline =
      match.verificationDeadline ??
      new Date(matchEndDate(match).getTime() + ATTENDANCE_GRACE_PERIOD_HOURS * 60 * 60 * 1000);

    await tx
      .update(hostedMatchesTable)
      .set({
        status: ["confirmed", "fully_paid", "open"].includes(match.status)
          ? "pending_verification"
          : match.status,
        verificationDeadline,
        updatedAt: now,
      })
      .where(eq(hostedMatchesTable.id, matchId));

    // Re-evaluate quorum with the new confirmation included
    const quorumStatus = await _evaluateAndFinalizeQuorum(tx as unknown as typeof db, matchId, now);

    logger.info({ matchId, hostUserId, quorumReached: quorumStatus.quorumReached }, "Phase 3: host attendance verified");

    return {
      outcome: "confirmed",
      quorumReached: quorumStatus.quorumReached,
      quorumStatus,
    };
  });
}

// ─── Player Confirmation ──────────────────────────────────────────────────────

/**
 * Player confirms their attendance at the match.
 *
 * Effects:
 *  1. Validates player is a paid participant.
 *  2. Upserts a player confirmation row (idempotent).
 *  3. Checks quorum — if met, transitions to completed.
 */
export async function confirmAttendanceAsPlayer(
  matchId: string,
  userId: string
): Promise<VerifyAttendanceResult> {
  if (!ENABLE_ATTENDANCE_VERIFICATION) {
    return { outcome: "feature_disabled" };
  }

  return db.transaction(async (tx) => {
    // Lock the match
    const [match] = await tx
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .for("update")
      .limit(1);

    if (!match) {
      return { outcome: "match_not_eligible", reason: "Match not found" };
    }

    if (!hasMatchEnded(match)) {
      return { outcome: "match_not_eligible", reason: "Match has not ended yet" };
    }

    if (isGracePeriodExpired(match.verificationDeadline)) {
      return { outcome: "match_not_eligible", reason: "Verification grace period has expired" };
    }

    const ineligibleStatuses = ["completed", "disputed", "cancelled", "cancelled_underfilled", "expired"];
    if (ineligibleStatuses.includes(match.status)) {
      return { outcome: "match_not_eligible", reason: `Match is already ${match.status}` };
    }

    // Verify caller is a paid participant
    const [participant] = await tx
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          eq(hostedMatchParticipantsTable.userId, userId),
          inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"])
        )
      )
      .limit(1);

    if (!participant) {
      return { outcome: "not_authorized", reason: "You are not a paid participant in this match" };
    }

    // Idempotency: already confirmed?
    const [existing] = await tx
      .select()
      .from(matchAttendanceConfirmationsTable)
      .where(
        and(
          eq(matchAttendanceConfirmationsTable.matchId, matchId),
          eq(matchAttendanceConfirmationsTable.userId, userId),
          eq(matchAttendanceConfirmationsTable.role, "player")
        )
      )
      .limit(1);

    if (existing?.status === "confirmed") {
      return { outcome: "already_confirmed" };
    }

    const now = new Date();

    if (existing) {
      await tx
        .update(matchAttendanceConfirmationsTable)
        .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
        .where(eq(matchAttendanceConfirmationsTable.id, existing.id));
    } else {
      await tx.insert(matchAttendanceConfirmationsTable).values({
        matchId,
        participantId: participant.id,
        userId,
        role: "player",
        status: "confirmed",
        confirmedAt: now,
      });
    }

    const quorumStatus = await _evaluateAndFinalizeQuorum(tx as unknown as typeof db, matchId, now);

    logger.info({ matchId, userId, quorumReached: quorumStatus.quorumReached }, "Phase 3: player attendance confirmed");

    return {
      outcome: "confirmed",
      quorumReached: quorumStatus.quorumReached,
      quorumStatus,
    };
  });
}

// ─── Dispute ──────────────────────────────────────────────────────────────────

/**
 * Manually mark a match as disputed (admin or cron use).
 * Also callable by host explicitly.
 */
export async function markMatchDisputed(
  matchId: string,
  reason: string = "Manual dispute"
): Promise<DisputeResult> {
  const [match] = await db
    .select()
    .from(hostedMatchesTable)
    .where(eq(hostedMatchesTable.id, matchId))
    .limit(1);

  if (!match) return { outcome: "not_eligible", reason: "Match not found" };
  if (match.status === "disputed") return { outcome: "already_disputed" };

  const eligibleStatuses = ["pending_verification", "confirmed", "fully_paid", "open"];
  if (!eligibleStatuses.includes(match.status)) {
    return { outcome: "not_eligible", reason: `Cannot dispute a match with status: ${match.status}` };
  }

  await db
    .update(hostedMatchesTable)
    .set({
      status: "disputed",
      cancelledReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(hostedMatchesTable.id, matchId));

  logger.info({ matchId, reason }, "Phase 3: match marked disputed");
  return { outcome: "disputed" };
}

// ─── Internal: Quorum Evaluation ─────────────────────────────────────────────

/**
 * Called inside a transaction after a new confirmation is added.
 * Re-counts confirmations and if quorum is reached:
 *   - Transitions match → completed
 *   - Sets settlementReleasesAt = now + 24h
 *   - Sends in-match notification to host
 *
 * Returns the live QuorumStatus.
 */
async function _evaluateAndFinalizeQuorum(
  txDb: typeof db,
  matchId: string,
  now: Date
): Promise<QuorumStatus> {
  // Re-read match inside transaction (already locked by caller)
  const [match] = await txDb
    .select()
    .from(hostedMatchesTable)
    .where(eq(hostedMatchesTable.id, matchId))
    .limit(1);

  if (!match) throw new Error(`Match ${matchId} not found in quorum check`);

  const [{ value: totalPaid }] = await txDb
    .select({ value: count() })
    .from(hostedMatchParticipantsTable)
    .where(
      and(
        eq(hostedMatchParticipantsTable.matchId, matchId),
        inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"])
      )
    );

  const totalPaidParticipants = Number(totalPaid);
  const requiredPlayerConfirmations = calculatePlayerQuorum(totalPaidParticipants);

  const [{ value: hostCount }] = await txDb
    .select({ value: count() })
    .from(matchAttendanceConfirmationsTable)
    .where(
      and(
        eq(matchAttendanceConfirmationsTable.matchId, matchId),
        eq(matchAttendanceConfirmationsTable.role, "host"),
        eq(matchAttendanceConfirmationsTable.status, "confirmed")
      )
    );

  const [{ value: playerCount }] = await txDb
    .select({ value: count() })
    .from(matchAttendanceConfirmationsTable)
    .where(
      and(
        eq(matchAttendanceConfirmationsTable.matchId, matchId),
        eq(matchAttendanceConfirmationsTable.role, "player"),
        eq(matchAttendanceConfirmationsTable.status, "confirmed")
      )
    );

  const hostConfirmed = Number(hostCount) >= 1;
  const playerConfirmationsReceived = Number(playerCount);
  const quorumReached = hostConfirmed && playerConfirmationsReceived >= requiredPlayerConfirmations;

  let settlementReleasesAt = match.settlementReleasesAt ?? null;

  if (quorumReached && match.status !== "completed" && match.status !== "risk_hold") {
    // Phase 9: Enqueue risk evaluation. The match stays in its current status until evaluated.
    // The worker will either mark it "completed" (and schedule settlement) or "risk_hold".
    
    await enqueueRiskEvaluation({ type: "match", matchId });
    
    logger.info({ matchId }, "Phase 9: quorum reached — enqueued risk evaluation");
  }

  return {
    matchId,
    totalPaidParticipants,
    requiredPlayerConfirmations,
    hostConfirmed,
    playerConfirmationsReceived,
    quorumReached,
    verificationDeadline: match.verificationDeadline ?? null,
    settlementReleasesAt,
    matchStatus: match.status,
  };
}

// ─── Cron: Release Settled Payouts ────────────────────────────────────────────

/**
 * Called by cron every 30 minutes.
 * For completed matches where settlementReleasesAt has passed:
 *   - Mark payout rows ready_for_settlement
 */
export async function releaseVerifiedPayouts(): Promise<{ released: number; errors: number; details: string[] }> {
  const result = { released: 0, errors: 0, details: [] as string[] };
  if (!ENABLE_ATTENDANCE_VERIFICATION) return result;

  const now = new Date();

  const readyMatches = await db
    .select()
    .from(hostedMatchesTable)
    .where(
      and(
        eq(hostedMatchesTable.status, "completed"),
        sql`${hostedMatchesTable.settlementReleasesAt} IS NOT NULL`,
        sql`${hostedMatchesTable.settlementReleasesAt} <= ${now.toISOString()}`
      )
    );

  for (const match of readyMatches) {
    try {
      const updated = await db
        .update(venuePayoutLedgerTable)
        .set({ status: "ready_for_settlement" })
        .where(
          and(
            eq(venuePayoutLedgerTable.referenceId, match.id),
            eq(venuePayoutLedgerTable.status, "pending")
          )
        )
        .returning({ id: venuePayoutLedgerTable.id });

      if (updated.length > 0) {
        result.released++;
        result.details.push(`Match ${match.id}: released ${updated.length} payout row(s)`);
        logger.info({ matchId: match.id, rows: updated.length }, "Phase 3: payouts released after settlement hold");
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Match ${match.id} payout release failed: ${String(err)}`);
      logger.error({ err, matchId: match.id }, "Phase 3: payout release error");
    }
  }

  return result;
}

// ─── Cron: Expire Unverified Matches ─────────────────────────────────────────

/**
 * Called by cron every 15 minutes.
 * For matches in pending_verification where verificationDeadline has passed:
 *   - Transition to "disputed"
 *   - Admin review required
 */
export async function expireUnverifiedMatches(): Promise<{ disputed: number; errors: number; details: string[] }> {
  const result = { disputed: 0, errors: 0, details: [] as string[] };
  if (!ENABLE_ATTENDANCE_VERIFICATION) return result;

  const now = new Date();

  const expiredMatches = await db
    .select()
    .from(hostedMatchesTable)
    .where(
      and(
        eq(hostedMatchesTable.status, "pending_verification"),
        sql`${hostedMatchesTable.verificationDeadline} IS NOT NULL`,
        sql`${hostedMatchesTable.verificationDeadline} <= ${now.toISOString()}`
      )
    );

  for (const match of expiredMatches) {
    try {
      await db
        .update(hostedMatchesTable)
        .set({
          status: "disputed",
          cancelledReason: "Attendance quorum not reached within 48h grace period",
          updatedAt: now,
        })
        .where(eq(hostedMatchesTable.id, match.id));

      result.disputed++;
      result.details.push(`Match ${match.id} → disputed (grace expired at ${match.verificationDeadline?.toISOString()})`);
      logger.info({ matchId: match.id }, "Phase 3: match disputed — verification window expired");
    } catch (err) {
      result.errors++;
      result.details.push(`Match ${match.id} expiry failed: ${String(err)}`);
      logger.error({ err, matchId: match.id }, "Phase 3: match expiry error");
    }
  }

  return result;
}
