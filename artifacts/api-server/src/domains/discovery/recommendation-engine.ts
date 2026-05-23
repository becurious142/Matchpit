import { db, profilesTable, bookingsTable, socialGraphEdgesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export interface UserPreferences {
  favoriteSports: string[];
  preferredTimeRange: { start: number; end: number }; // e.g. 18 to 22 (6pm to 10pm)
  frequentVenues: string[];
  bookingFrequency: "high" | "medium" | "low";
  socialGraphAffinity: string[]; // Team IDs or User IDs they interact with often
}

export class RecommendationEngine {
  /**
   * Generates a rules-based preference profile for a user based on their history.
   * NO Machine Learning here as per Phase 17 constraint (to preserve explainability and infra cost).
   */
  static async getUserPreferences(userId: string): Promise<UserPreferences> {
    // Basic defaults
    let preferences: UserPreferences = {
      favoriteSports: [],
      preferredTimeRange: { start: 17, end: 22 }, // Default evening
      frequentVenues: [],
      bookingFrequency: "low",
      socialGraphAffinity: []
    };

    try {
      // 1. Fetch favorite sports from profile
      const [profile] = await db.select({ metadata: profilesTable.metadata })
        .from(profilesTable)
        .where(eq(profilesTable.id, userId));
      
      if (profile?.metadata?.favoriteSports) {
        preferences.favoriteSports = profile.metadata.favoriteSports as string[];
      }

      // 2. Derive frequent venues & play times from booking history
      const history = await db.execute(sql`
        SELECT 
          m.venue_id,
          m.sport,
          EXTRACT(HOUR FROM m.start_time) as "hourOfDay"
        FROM ${bookingsTable} b
        JOIN hosted_matches m ON b.match_id = m.id
        WHERE b.user_id = ${userId} AND b.status = 'confirmed'
        ORDER BY b.created_at DESC
        LIMIT 20
      `);

      if (history.length > 0) {
        // Derive booking frequency
        preferences.bookingFrequency = history.length > 10 ? "high" : history.length > 3 ? "medium" : "low";

        // Aggregate venue frequency
        const venueCounts = history.reduce((acc: any, row: any) => {
          acc[row.venue_id] = (acc[row.venue_id] || 0) + 1;
          return acc;
        }, {});
        
        preferences.frequentVenues = Object.entries(venueCounts)
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 3)
          .map(entry => entry[0]);

        // If no explicit sports, infer from history
        if (preferences.favoriteSports.length === 0) {
          const sportCounts = history.reduce((acc: any, row: any) => {
            acc[row.sport] = (acc[row.sport] || 0) + 1;
            return acc;
          }, {});
          preferences.favoriteSports = Object.entries(sportCounts)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 2)
            .map(entry => entry[0]);
        }
      }

      // 3. Phase 18: Social Graph Affinity
      const socialEdges = await db.select({ targetId: socialGraphEdgesTable.targetId })
        .from(socialGraphEdgesTable)
        .where(eq(socialGraphEdgesTable.sourceId, userId));
      
      if (socialEdges.length > 0) {
        preferences.socialGraphAffinity = socialEdges.map(edge => edge.targetId);
      }

    } catch (err) {
      logger.error({ err, userId }, "Failed to generate user preferences");
    }

    return preferences;
  }
}
