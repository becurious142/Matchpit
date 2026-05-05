import { db } from "@workspace/db";
import {
  bookingsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  badgesTable,
  profilesTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "./logger";

export interface BadgeDefinition {
  slug: string;
  label: string;
  description: string;
  icon: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    slug: "early_player",
    label: "Early Player",
    description: "Joined MATCHPIT in the first wave",
    icon: "🌅",
  },
  {
    slug: "reliable_player",
    label: "Reliable Player",
    description: "Completed 5+ bookings without cancellations",
    icon: "✅",
  },
  {
    slug: "match_regular",
    label: "Match Regular",
    description: "Joined 5+ hosted matches",
    icon: "🏃",
  },
  {
    slug: "power_host",
    label: "Power Host",
    description: "Hosted 3+ confirmed matches",
    icon: "⚡",
  },
  {
    slug: "fair_host",
    label: "Fair Host",
    description: "Hosted matches with 0 cancellations",
    icon: "🤝",
  },
  {
    slug: "verified_organizer",
    label: "Verified Organizer",
    description: "Hosted 5+ matches with full squad",
    icon: "🎖️",
  },
  {
    slug: "no_show_risk",
    label: "No Show Risk",
    description: "Has a history of no-shows",
    icon: "⚠️",
  },
];

export async function computeAndAwardBadges(userId: string): Promise<string[]> {
  const earnedSlugs: string[] = [];

  try {
    const [completedBookings] = await db
      .select({ n: count() })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.userId, userId), eq(bookingsTable.status, "confirmed")));

    const [cancelledBookings] = await db
      .select({ n: count() })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.userId, userId), eq(bookingsTable.status, "cancelled")));

    const [hostedMatches] = await db
      .select({ n: count() })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.hostUserId, userId));

    const [confirmedHosted] = await db
      .select({ n: count() })
      .from(hostedMatchesTable)
      .where(
        and(
          eq(hostedMatchesTable.hostUserId, userId),
          eq(hostedMatchesTable.status, "confirmed"),
        ),
      );

    const [joinedMatches] = await db
      .select({ n: count() })
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.userId, userId));

    const completedCount = Number(completedBookings.n);
    const cancelledCount = Number(cancelledBookings.n);
    const hostedCount = Number(hostedMatches.n);
    const confirmedHostedCount = Number(confirmedHosted.n);
    const joinedCount = Number(joinedMatches.n);

    const conditions: Array<{ slug: string; earned: boolean }> = [
      { slug: "early_player", earned: true },
      { slug: "reliable_player", earned: completedCount >= 5 && cancelledCount === 0 },
      { slug: "match_regular", earned: joinedCount >= 5 },
      { slug: "power_host", earned: confirmedHostedCount >= 3 },
      { slug: "fair_host", earned: hostedCount >= 1 && cancelledCount === 0 },
      { slug: "verified_organizer", earned: confirmedHostedCount >= 5 },
      { slug: "no_show_risk", earned: cancelledCount >= 3 && cancelledCount > completedCount },
    ];

    const existingBadges = await db
      .select({ slug: badgesTable.slug })
      .from(badgesTable)
      .where(eq(badgesTable.userId, userId));

    const existingSlugs = new Set(existingBadges.map((b) => b.slug));

    for (const { slug, earned } of conditions) {
      if (earned && !existingSlugs.has(slug)) {
        const def = BADGE_DEFINITIONS.find((d) => d.slug === slug);
        if (!def) continue;
        await db.insert(badgesTable).values({
          userId,
          slug: def.slug,
          label: def.label,
          description: def.description,
          icon: def.icon,
        });
        earnedSlugs.push(slug);
      }
    }

    const totalBadges = existingSlugs.size + earnedSlugs.length;
    await db
      .update(profilesTable)
      .set({ badgeCount: totalBadges, updatedAt: new Date() })
      .where(eq(profilesTable.id, userId));

    if (earnedSlugs.length > 0) {
      logger.info({ userId, earnedSlugs }, "Badges awarded");
    }
  } catch (err) {
    logger.error({ err, userId }, "Badge computation error");
  }

  return earnedSlugs;
}

export async function getUserBadges(userId: string) {
  return db
    .select()
    .from(badgesTable)
    .where(eq(badgesTable.userId, userId))
    .orderBy(badgesTable.earnedAt);
}
