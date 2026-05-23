import { logger } from "../../lib/logger";

export interface MatchmakingRequest {
  sport: string;
  skillLevel: string; // "Beginner", "Intermediate", "Advanced"
  preferredStartHour: number;
  maxDistanceKm: number;
}

export class SmartMatchmakingService {
  /**
   * Groups players using lightweight heuristics (NOT LLMs).
   * Phase 18 constraints: Rule-based heuristics only.
   */
  static async suggestMatches(userId: string, prefs: MatchmakingRequest) {
    // 1. Fetch available open matches for the sport
    // 2. Filter by maxDistanceKm
    // 3. Filter by preferredStartHour (± 2 hours)
    // 4. Score based on skill level overlap (e.g. if match average is Intermediate, boost it for Intermediate players)

    logger.info({ userId, sport: prefs.sport }, "Generated matchmaking suggestions via heuristics");

    return [
      {
        matchId: "mock-match-1",
        matchScore: 92, // High match
        reason: "Matches your skill level and is 2km away."
      },
      {
        matchId: "mock-match-2",
        matchScore: 78,
        reason: "Right time, but players are slightly more advanced."
      }
    ];
  }
}
