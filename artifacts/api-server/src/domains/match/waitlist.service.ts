import { db } from "@workspace/db";
import { waitlistTable } from "@workspace/db";
import { hostedMatchParticipantsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { DistributedLockService } from "../../lib/locking/distributed-lock";
import { emitUserEvent } from "../../events/user-events";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";
import { getQueueConnection } from "../../queues/redis";

const redis = getQueueConnection();

export class WaitlistService {
  /**
   * Joins the waitlist for a full match.
   */
  static async joinWaitlist(userId: string, matchId: string) {
    await db.insert(waitlistTable).values({
      userId,
      matchId,
      status: "waiting",
    }).onConflictDoNothing(); // If already waiting, do nothing

    logger.info({ userId, matchId }, "User joined waitlist");
  }

  /**
   * Automatically promotes the next user from the waitlist when a slot opens up.
   * This MUST be transactional and use distributed locks to prevent split-brain promotions.
   */
  static async processPromotion(matchId: string) {
    const lockResource = `match:${matchId}:waitlist_promotion`;
    const lock = await DistributedLockService.acquire(lockResource, 15000); // 15s lock

    try {
      // 1. Double check if there is an actual open slot
      // We assume slots total vs reserved/final_paid logic here.
      // (Simplified logic for illustration)
      const [{ availableSlots }] = await db.execute(sql`
        SELECT (m.max_players - COUNT(p.id)) as "availableSlots"
        FROM hosted_matches m
        LEFT JOIN hosted_match_participants p ON p.match_id = m.id AND p.status IN ('reserved', 'final_paid')
        WHERE m.id = ${matchId}
        GROUP BY m.max_players
      `);

      if (Number(availableSlots) <= 0) {
        logger.debug({ matchId }, "No available slots for waitlist promotion.");
        return;
      }

      // 2. Get the next person in line
      const [nextUser] = await db.select()
        .from(waitlistTable)
        .where(and(eq(waitlistTable.matchId, matchId), eq(waitlistTable.status, "waiting")))
        .orderBy(waitlistTable.joinedAt)
        .limit(1);

      if (!nextUser) {
        logger.debug({ matchId }, "Waitlist is empty.");
        return;
      }

      // 3. Transactionally promote them
      await db.transaction(async (tx) => {
        // Reserve the spot for 15 minutes (payment timeout window)
        const paymentTimeoutMinutes = 15;
        const expiresAt = new Date(Date.now() + paymentTimeoutMinutes * 60 * 1000);

        await tx.update(waitlistTable)
          .set({ 
            status: "promoted", 
            promotedAt: new Date(),
            expiresAt
          })
          .where(eq(waitlistTable.id, nextUser.id));

        // Insert as reserved in participants table
        await tx.insert(hostedMatchParticipantsTable).values({
          matchId: matchId,
          userId: nextUser.userId,
          status: "reserved",
          paymentStatus: "none",
          finalPaymentDeadline: expiresAt,
        });
      });

      // 4. Notify User via SSE & push
      emitUserEvent("waitlist.promoted", { 
        userId: nextUser.userId, 
        matchId 
      });
      
      // Also publish an SSE event to the match stream so UI updates in realtime
      await redis.publish(`match:${matchId}`, JSON.stringify({
        type: "waitlist_promoted",
        payload: { userId: nextUser.userId }
      }));

      logger.info({ userId: nextUser.userId, matchId }, "User promoted from waitlist");
      
    } finally {
      await lock.release();
    }
  }

  /**
   * Called by a cron or worker when a promoted waitlist user fails to pay in time.
   */
  static async handleExpiredPromotion(waitlistId: string, matchId: string, userId: string) {
    const lockResource = `match:${matchId}:waitlist_promotion`;
    const lock = await DistributedLockService.acquire(lockResource, 15000);

    try {
      await db.transaction(async (tx) => {
        await tx.update(waitlistTable)
          .set({ status: "expired" })
          .where(eq(waitlistTable.id, waitlistId));
          
        await tx.update(hostedMatchParticipantsTable)
          .set({ status: "dropped_unpaid", droppedAt: new Date(), droppedReason: "waitlist_payment_expired" })
          .where(and(
            eq(hostedMatchParticipantsTable.matchId, matchId),
            eq(hostedMatchParticipantsTable.userId, userId),
            eq(hostedMatchParticipantsTable.status, "reserved")
          ));
      });
      
      emitUserEvent("waitlist.expired", { userId, matchId });
      
      // Since they expired, we have an open slot again. Trigger promotion for the next person!
      // Doing this asynchronously so we don't hold the lock longer than needed
      setTimeout(() => {
        WaitlistService.processPromotion(matchId).catch(err => {
          logger.error({ err, matchId }, "Failed to trigger cascade waitlist promotion");
        });
      }, 0);
      
    } finally {
      await lock.release();
    }
  }
}
