import { db, clubsTable, socialGraphEdgesTable } from "@workspace/db";
import { logger } from "../../lib/logger";

export class ClubsService {
  /**
   * Creates a new social club.
   */
  static async createClub(userId: string, name: string, sport: string, city: string) {
    const [club] = await db.insert(clubsTable).values({
      name,
      sport,
      city,
    }).returning();

    // Assign admin via the unified social graph
    await db.insert(socialGraphEdgesTable).values({
      sourceId: userId,
      sourceType: "user",
      edgeType: "club_member",
      targetId: club.id,
      targetType: "club",
      metadata: "admin", 
    });

    logger.info({ userId, clubId: club.id }, "Club created");
    return club;
  }

  /**
   * Joins a public social club.
   */
  static async joinClub(userId: string, clubId: string) {
    await db.insert(socialGraphEdgesTable).values({
      sourceId: userId,
      sourceType: "user",
      edgeType: "club_member",
      targetId: clubId,
      targetType: "club",
      metadata: "member", 
    }).onConflictDoNothing();

    logger.info({ userId, clubId }, "User joined club");
  }
}
