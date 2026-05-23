import { db, teamsTable, socialGraphEdgesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class TeamsService {
  /**
   * Creates a new competitive team and assigns the creator as captain.
   */
  static async createTeam(userId: string, name: string, sport: string, city: string) {
    const [team] = await db.insert(teamsTable).values({
      name,
      sport,
      city,
    }).returning();

    // Assign captain via the unified social graph
    await db.insert(socialGraphEdgesTable).values({
      sourceId: userId,
      sourceType: "user",
      edgeType: "team_member",
      targetId: team.id,
      targetType: "team",
      metadata: "captain", // role
    });

    logger.info({ userId, teamId: team.id }, "Team created");
    return team;
  }

  /**
   * Joins an existing team as a regular member.
   */
  static async joinTeam(userId: string, teamId: string) {
    await db.insert(socialGraphEdgesTable).values({
      sourceId: userId,
      sourceType: "user",
      edgeType: "team_member",
      targetId: teamId,
      targetType: "team",
      metadata: "member", // role
    }).onConflictDoNothing(); // Prevent duplicate joins

    logger.info({ userId, teamId }, "User joined team");
  }
}
