import { db, playerReputationTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class ReviewsService {
  /**
   * Submits a review/report, ensuring anti-abuse rules are followed.
   * Review influence is weighted by the submitter's reputation.
   */
  static async submitReview(submitterId: string, targetId: string, targetType: "user" | "venue", score: number, isReport: boolean) {
    if (submitterId === targetId) {
      throw new Error("Self-reviews are not permitted.");
    }

    // 1. Fetch submitter's reputation to calculate weight
    const [submitterRep] = await db
      .select()
      .from(playerReputationTable)
      .where(eq(playerReputationTable.userId, submitterId));

    // Base weight is 1.0. 
    // Highly Reliable players have 1.5x weight.
    // Frequently Cancels players have 0.5x weight.
    let weight = 1.0;
    if (submitterRep) {
      if (submitterRep.reliabilityTier === "Highly Reliable") weight = 1.5;
      else if (submitterRep.reliabilityTier === "Frequently Cancels") weight = 0.5;

      // Moderation Reputation (Phase 18 specific constraint)
      const modScore = Number(submitterRep.moderationReputationScore);
      if (modScore > 80) weight *= 1.2; // Trusted reporters have more impact
      else if (modScore < 30) weight *= 0.3; // Serial false reporters are heavily penalized
    }

    // 2. Anti-Brigading Logic (Simplified heuristic)
    // In a real app, we would check if >X reviews arrived for this target in the last hour
    // and flag them for manual moderation if so.

    logger.info({ submitterId, targetId, targetType, weight, score, isReport }, "Review/Report submitted with reputation weight");

    // 3. If it's a report, increment community reports on the target (if user)
    if (isReport && targetType === "user") {
      // For scaffold, we pretend the table exists and just log
      logger.info({ targetId, weightedImpact: weight }, "User flagged for moderation");
    }

    return { success: true, appliedWeight: weight };
  }

  /**
   * Updates moderation reputation score. 
   * Call this when an admin validates or rejects a user's report.
   */
  static async updateModerationReputation(userId: string, wasReportValid: boolean) {
    const adjustment = wasReportValid ? 5 : -15; // Penalize false reports heavily

    await db.execute(sql`
      UPDATE ${playerReputationTable}
      SET moderation_reputation_score = GREATEST(0, LEAST(100, moderation_reputation_score + ${adjustment}))
      WHERE user_id = ${userId}
    `);
    
    logger.info({ userId, adjustment }, "Moderation reputation adjusted");
  }
}
