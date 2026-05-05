import { db } from "@workspace/db";
import { communityPostsTable, citiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getJaipurCityId(): Promise<string | null> {
  const [city] = await db.select({ id: citiesTable.id }).from(citiesTable)
    .where(eq(citiesTable.slug, "jaipur")).limit(1);
  return city?.id ?? null;
}

export async function createAchievementPostForBadge(
  userId: string,
  badgeName: string,
  sport?: string,
): Promise<void> {
  try {
    const cityId = await getJaipurCityId();
    await db.insert(communityPostsTable).values({
      userId,
      cityId,
      type: "achievement",
      caption: `Just earned the "${badgeName}" badge on MATCHPIT! Levelling up the game one match at a time. 🏆`,
      sport: sport ?? null,
    });
  } catch { /* non-fatal */ }
}

export async function createAchievementPostForHostedMatchMilestone(
  userId: string,
  matchCount: number,
  sport: string,
  matchId?: string,
): Promise<void> {
  try {
    const cityId = await getJaipurCityId();
    await db.insert(communityPostsTable).values({
      userId,
      cityId,
      type: "achievement",
      caption: `Just hosted my ${matchCount}${matchCount === 1 ? "st" : matchCount === 2 ? "nd" : matchCount === 3 ? "rd" : "th"} ${sport} match on MATCHPIT! Who's next to step up? ⚡`,
      sport,
      relatedMatchId: matchId ?? null,
    });
  } catch { /* non-fatal */ }
}

export async function createAchievementPostForMatchConfirmed(
  hostUserId: string,
  sport: string,
  matchId: string,
  playerCount: number,
): Promise<void> {
  try {
    const cityId = await getJaipurCityId();
    await db.insert(communityPostsTable).values({
      userId: hostUserId,
      cityId,
      type: "match_result",
      caption: `Match confirmed! 🔥 ${playerCount} players locked in for a ${sport} game. The pitch is calling — see you there!`,
      sport,
      relatedMatchId: matchId,
    });
  } catch { /* non-fatal */ }
}

export async function createAchievementPostForReferralMilestone(
  userId: string,
  referralCount: number,
): Promise<void> {
  try {
    const cityId = await getJaipurCityId();
    await db.insert(communityPostsTable).values({
      userId,
      cityId,
      type: "achievement",
      caption: `Just brought ${referralCount} friend${referralCount > 1 ? "s" : ""} onto MATCHPIT! Building Jaipur's best sports community, one player at a time. 🤝`,
    });
  } catch { /* non-fatal */ }
}

export async function createAchievementPostForSquadChallengeWin(
  captainUserId: string,
  squadName: string,
  sport: string,
  squadId: string,
): Promise<void> {
  try {
    const cityId = await getJaipurCityId();
    await db.insert(communityPostsTable).values({
      userId: captainUserId,
      cityId,
      type: "challenge",
      caption: `${squadName} wins! 🏆 What a game on the ${sport} pitch. Challenge us if you think you can keep up.`,
      sport,
      relatedSquadId: squadId,
    });
  } catch { /* non-fatal */ }
}

export async function createSystemAchievementPost(
  userId: string,
  caption: string,
  type: "achievement" | "match_result" | "challenge" | "text" = "achievement",
  opts?: {
    sport?: string;
    relatedMatchId?: string;
    relatedVenueId?: string;
    relatedSquadId?: string;
  },
): Promise<void> {
  try {
    const cityId = await getJaipurCityId();
    await db.insert(communityPostsTable).values({
      userId,
      cityId,
      type,
      caption,
      sport: opts?.sport ?? null,
      relatedMatchId: opts?.relatedMatchId ?? null,
      relatedVenueId: opts?.relatedVenueId ?? null,
      relatedSquadId: opts?.relatedSquadId ?? null,
    });
  } catch { /* non-fatal */ }
}
