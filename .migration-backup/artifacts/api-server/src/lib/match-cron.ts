import { db } from "@workspace/db";
import {
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  profilesTable,
  slotsTable,
} from "@workspace/db";
import { eq, and, lt, inArray } from "drizzle-orm";
import { processUnderfillRefund } from "./wallet";
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
            inArray(hostedMatchParticipantsTable.status, ["reserved"]),
          ),
        );

      await db
        .update(hostedMatchesTable)
        .set({
          status: "cancelled_underfilled",
          cancelledReason: `Match expired with only ${match.currentPlayers}/${match.minPlayers} minimum players`,
          underfillRefundIssued: true,
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchesTable.id, match.id));

      await db
        .update(slotsTable)
        .set({ status: "available", updatedAt: new Date() })
        .where(eq(slotsTable.id, match.slotId));

      for (const participant of participants) {
        const reserveFee = Number(match.reserveFee);
        if (reserveFee > 0) {
          await processUnderfillRefund(participant.userId, match.id, reserveFee);
        }
        await db
          .update(hostedMatchParticipantsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(hostedMatchParticipantsTable.id, participant.id));
      }

      if (match.hostUserId) {
        const hostFee = Number(match.hostFee);
        if (hostFee > 0) {
          await processUnderfillRefund(match.hostUserId, match.id, hostFee);
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
