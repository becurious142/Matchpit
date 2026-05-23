import { db, profilesTable, playerReputationTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class PlayerProfileService {
  /**
   * Fetches the public profile for a user.
   * Strips out raw metrics and PII, returning only qualitative badges.
   */
  static async getPublicProfile(username: string) {
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.username, username));

    if (!profile) return null;

    const [reputation] = await db
      .select()
      .from(playerReputationTable)
      .where(eq(playerReputationTable.userId, profile.id));

    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      reliabilityBadge: reputation?.reliabilityTier || "New Player",
      matchesPlayed: reputation?.totalMatchesPlayed || 0,
      favoriteSports: profile.metadata?.favoriteSports || [],
      joinedAt: profile.createdAt,
    };
  }

  /**
   * Called internally to recalculate reputation tiers after match completion.
   */
  static async updateReliabilityTier(userId: string) {
    const [rep] = await db
      .select()
      .from(playerReputationTable)
      .where(eq(playerReputationTable.userId, userId));

    if (!rep) return;

    let newTier = rep.reliabilityTier;
    const att = Number(rep.attendanceRatePct);
    const played = rep.totalMatchesPlayed;

    if (played > 10 && att >= 95) {
      newTier = "Highly Reliable";
    } else if (played > 3 && att >= 80) {
      newTier = "Regular Player";
    } else if (played > 3 && att < 50) {
      newTier = "Frequently Cancels";
    }

    if (newTier !== rep.reliabilityTier) {
      await db
        .update(playerReputationTable)
        .set({ reliabilityTier: newTier as any, lastUpdated: new Date() })
        .where(eq(playerReputationTable.userId, userId));
        
      logger.info({ userId, oldTier: rep.reliabilityTier, newTier }, "Player reliability tier updated");
    }
  }
}
