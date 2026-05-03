import { db } from "@workspace/db";
import {
  communityPostsTable,
  hostedMatchesTable,
  matchMessagesTable,
  userStrikesTable,
  profilesTable,
} from "@workspace/db";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { logger } from "./logger";

const MAX_POSTS_PER_DAY = 5;
const MAX_MATCHES_PER_DAY = 3;
const MAX_CHAT_IN_5MIN = 10;
const DROP_ABUSE_WINDOW_DAYS = 30;
const DROP_ABUSE_THRESHOLD = 3;

export async function checkPostRateLimit(userId: string): Promise<boolean> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ c: count() })
    .from(communityPostsTable)
    .where(
      and(
        eq(communityPostsTable.userId, userId),
        gte(communityPostsTable.createdAt, since)
      )
    );
  return Number(row.c) < MAX_POSTS_PER_DAY;
}

export async function checkMatchRateLimit(userId: string): Promise<boolean> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ c: count() })
    .from(hostedMatchesTable)
    .where(
      and(
        eq(hostedMatchesTable.hostUserId, userId),
        gte(hostedMatchesTable.createdAt, since)
      )
    );
  return Number(row.c) < MAX_MATCHES_PER_DAY;
}

export async function checkChatRateLimit(userId: string, matchId: string): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [row] = await db
    .select({ c: count() })
    .from(matchMessagesTable)
    .where(
      and(
        eq(matchMessagesTable.userId, userId),
        eq(matchMessagesTable.matchId, matchId),
        gte(matchMessagesTable.createdAt, fiveMinAgo)
      )
    );
  return Number(row.c) < MAX_CHAT_IN_5MIN;
}

export async function issueStrike(
  userId: string,
  type: "spam" | "drop_abuse" | "referral_abuse" | "no_show" | "report",
  points: number = 1,
  notes?: string
): Promise<void> {
  try {
    await db.insert(userStrikesTable).values({ userId, type, points, notes });
    await db
      .update(profilesTable)
      .set({ strikePoints: sql`${profilesTable.strikePoints} + ${points}` })
      .where(eq(profilesTable.id, userId));
    // Auto-suspend if >= 10 points
    const [profile] = await db
      .select({ strikePoints: profilesTable.strikePoints })
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1);
    if (profile && Number(profile.strikePoints) >= 10) {
      await db
        .update(profilesTable)
        .set({ isSuspended: true })
        .where(eq(profilesTable.id, userId));
      logger.warn({ userId }, "User auto-suspended due to strike points >= 10");
    }
  } catch (err) {
    logger.error({ err, userId, type }, "Failed to issue strike");
  }
}

export async function checkDropAbuse(userId: string): Promise<boolean> {
  const since = new Date();
  since.setDate(since.getDate() - DROP_ABUSE_WINDOW_DAYS);
  const [row] = await db
    .select({ c: count() })
    .from(userStrikesTable)
    .where(
      and(
        eq(userStrikesTable.userId, userId),
        eq(userStrikesTable.type, "drop_abuse"),
        gte(userStrikesTable.createdAt, since)
      )
    );
  return Number(row.c) >= DROP_ABUSE_THRESHOLD;
}
