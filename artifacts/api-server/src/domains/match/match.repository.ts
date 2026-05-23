import { db, hostedMatchesTable, hostedMatchParticipantsTable, venuesTable, profilesTable, slotsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";

export class MatchRepository {
  async getMatchById(matchId: string) {
    const [match] = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .limit(1);
    return match || null;
  }

  async getMatchWithVenueAndHost(matchId: string) {
    const match = await this.getMatchById(matchId);
    if (!match) return null;

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, match.venueId)).limit(1);
    const [host] = await db.select().from(profilesTable).where(eq(profilesTable.id, match.hostUserId)).limit(1);

    return { match, venue: venue || null, host: host || null };
  }

  async getSlotById(slotId: string) {
    const [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
    return slot || null;
  }

  async getParticipant(matchId: string, userId: string) {
    const [participant] = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          eq(hostedMatchParticipantsTable.userId, userId)
        )
      )
      .limit(1);
    return participant || null;
  }

  async getOtherParticipants(matchId: string, excludeUserId: string) {
    return await db
      .select({ userId: hostedMatchParticipantsTable.userId })
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          ne(hostedMatchParticipantsTable.userId, excludeUserId)
        )
      );
  }
}

export const matchRepository = new MatchRepository();
