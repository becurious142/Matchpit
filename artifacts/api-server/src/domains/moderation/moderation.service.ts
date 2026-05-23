import { db, profilesTable, playerReputationTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class ModerationService {
  /**
   * Processes an incoming report from the community and calculates the escalation severity.
   */
  static async evaluateReport(targetId: string, targetType: "user" | "team" | "venue" | "tournament", reportReason: string, submitterReputationScore: number) {
    let severity = 0;

    // Toxicity flags are high severity
    if (["harassment", "hate_speech", "violence"].includes(reportReason)) {
      severity += 80;
    } else if (reportReason === "fraud" || reportReason === "scam") {
      severity += 90;
    } else {
      severity += 30;
    }

    // Adjust severity based on the trusted nature of the reporter
    if (submitterReputationScore > 80) severity *= 1.5;
    else if (submitterReputationScore < 30) severity *= 0.2; // Likely false report

    logger.info({ targetId, targetType, reportReason, severity }, "Report evaluated by Moderation Engine");

    // Auto-escalation threshold
    if (severity >= 100) {
      this.escalateToAdminQueue(targetId, targetType, "high_severity_auto_flag");
    }
  }

  private static escalateToAdminQueue(targetId: string, targetType: string, reason: string) {
    logger.warn({ targetId, targetType, reason }, "🔥 ESCALATED to Admin Moderation Queue");
    // In a real app: Insert into `admin_moderation_queue` table
  }

  /**
   * Evaluates tournament organizers for potential collusion or fraud.
   * Phase 18 constraint addition.
   */
  static evaluateTournamentRisk(organizerId: string, prizePoolAmount: number, entryFee: number) {
    if (prizePoolAmount > 100000) { // e.g., huge prize pool
      this.escalateToAdminQueue(organizerId, "tournament_organizer", "high_prize_pool_review_required");
    }
    // Flag if entry fee is suspiciously high compared to prize pool
    if (entryFee * 10 > prizePoolAmount && entryFee > 5000) {
       this.escalateToAdminQueue(organizerId, "tournament_organizer", "suspicious_entry_fee_ratio");
    }
  }
}
