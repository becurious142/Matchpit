import { db, bookingsTable, hostedMatchesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class RematchEngine {
  /**
   * Suggests rematches based on historical squads.
   * e.g. "You played with Team A last Friday, book them again!"
   */
  static async suggestRematches(userId: string) {
    // 1. Find recent matches the user participated in
    const recentSquads = await db.execute(sql`
      SELECT 
        m.id as "matchId", 
        m.venue_id as "venueId",
        COUNT(b.id) as "squadSize"
      FROM ${hostedMatchesTable} m
      JOIN ${bookingsTable} b ON b.match_id = m.id
      WHERE m.id IN (
        SELECT match_id FROM ${bookingsTable} WHERE user_id = ${userId}
      )
      AND m.start_time < NOW()
      GROUP BY m.id, m.venue_id
      HAVING COUNT(b.id) >= 4
      ORDER BY m.start_time DESC
      LIMIT 5
    `);

    logger.info({ userId, suggestionsFound: recentSquads.length }, "Rematch suggestions generated");
    
    return recentSquads.map((squad: any) => ({
      originalMatchId: squad.matchId,
      suggestedVenueId: squad.venueId,
      squadSize: Number(squad.squadSize),
      message: `Rebook your squad of ${squad.squadSize} from your recent game!`,
    }));
  }
}
