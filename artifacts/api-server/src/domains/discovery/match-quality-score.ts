import { logger } from "../../lib/logger";

export class MatchQualityScoring {
  /**
   * Predicts the likelihood of a match filling up and going ahead successfully.
   * Used to highlight "Hot" matches or hide "Dead" matches.
   */
  static predictFillProbability(matchId: string, currentPlayers: number, maxPlayers: number, hoursUntilStart: number): number {
    let score = 0;

    const fillRatio = currentPlayers / maxPlayers;

    if (fillRatio >= 0.8) score += 60; // Almost full
    else if (fillRatio >= 0.5) score += 40; // Half full
    else score += 10; // Empty

    if (hoursUntilStart < 12 && fillRatio < 0.3) {
      score -= 30; // High risk of cancellation
    } else if (hoursUntilStart > 48) {
      score += 20; // Plenty of time to fill
    }

    // Limit score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, score));
    logger.info({ matchId, finalScore }, "Match quality score calculated");
    
    return finalScore;
  }
}
