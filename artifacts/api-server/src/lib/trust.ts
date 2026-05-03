import { db } from "@workspace/db";
import {
  bookingsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  userStatsTable,
  profilesTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "./logger";

export async function computeAndUpdateTrustScore(userId: string): Promise<void> {
  try {
    const [completedBookings] = await db
      .select({ n: count() })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.userId, userId), eq(bookingsTable.status, "confirmed")));

    const [cancelledBookings] = await db
      .select({ n: count() })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.userId, userId), eq(bookingsTable.status, "cancelled")));

    const [totalHosted] = await db
      .select({ n: count() })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.hostUserId, userId));

    const [completedHosted] = await db
      .select({ n: count() })
      .from(hostedMatchesTable)
      .where(and(eq(hostedMatchesTable.hostUserId, userId), eq(hostedMatchesTable.status, "confirmed")));

    const [totalJoined] = await db
      .select({ n: count() })
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.userId, userId));

    const [droppedCount] = await db
      .select({ n: count() })
      .from(hostedMatchParticipantsTable)
      .where(and(eq(hostedMatchParticipantsTable.userId, userId), eq(hostedMatchParticipantsTable.status, "dropped_unpaid")));

    const completed = Number(completedBookings.n);
    const cancelled = Number(cancelledBookings.n);
    const noShows = Number(droppedCount.n);

    const totalActivity = completed + cancelled + 1;
    const rawScore = (completed / totalActivity) * 100;
    const penalised = Math.max(0, rawScore - noShows * 5);
    const reliabilityScore = Math.round(Math.min(100, Math.max(0, penalised)) * 100) / 100;

    const [existing] = await db
      .select({ id: userStatsTable.id })
      .from(userStatsTable)
      .where(eq(userStatsTable.userId, userId))
      .limit(1);

    const statsData = {
      totalBookings: completed + cancelled,
      completedBookings: completed,
      cancelledBookings: cancelled,
      totalHostedMatches: Number(totalHosted.n),
      completedHostedMatches: Number(completedHosted.n),
      totalMatchesJoined: Number(totalJoined.n),
      noShowCount: noShows,
      reliabilityScore: reliabilityScore.toString(),
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(userStatsTable)
        .set(statsData)
        .where(eq(userStatsTable.userId, userId));
    } else {
      await db.insert(userStatsTable).values({ userId, ...statsData });
    }

    await db
      .update(profilesTable)
      .set({ trustScore: reliabilityScore.toString(), updatedAt: new Date() })
      .where(eq(profilesTable.id, userId));

    logger.info({ userId, reliabilityScore }, "Trust score updated");
  } catch (err) {
    logger.error({ err, userId }, "Failed to compute trust score");
  }
}

export async function getUserStats(userId: string) {
  const [stats] = await db
    .select()
    .from(userStatsTable)
    .where(eq(userStatsTable.userId, userId))
    .limit(1);

  if (!stats) {
    return {
      totalBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      totalHostedMatches: 0,
      completedHostedMatches: 0,
      totalMatchesJoined: 0,
      noShowCount: 0,
      reliabilityScore: 100,
    };
  }

  return {
    totalBookings: stats.totalBookings,
    completedBookings: stats.completedBookings,
    cancelledBookings: stats.cancelledBookings,
    totalHostedMatches: stats.totalHostedMatches,
    completedHostedMatches: stats.completedHostedMatches,
    totalMatchesJoined: stats.totalMatchesJoined,
    noShowCount: stats.noShowCount,
    reliabilityScore: Number(stats.reliabilityScore),
  };
}
