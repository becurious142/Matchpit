import { RankingItem } from "./ranking-engine";

export interface UserPreferences {
  favoriteSports: string[];
  preferredTimesOfDay: ("morning" | "afternoon" | "evening")[];
  historicalVenueIds: string[];
}

export interface MatchContext {
  sport: string;
  timeOfDay: "morning" | "afternoon" | "evening";
  venueId: string;
}

/**
 * Stateless Rules-Based Boosting Engine
 * 
 * Applies multiplier boosts based on simple matching rules between
 * user preferences/history and the item's context.
 * 
 * This runs *after* the base ranking engine.
 */
export class PersonalizationEngine {
  
  static boostScore(
    baseScore: number, 
    context: MatchContext, 
    userPrefs: UserPreferences | null
  ): number {
    if (!userPrefs) return baseScore; // Anonymous or new user, no personalization

    let multiplier = 1.0;

    // Rule 1: Affinity for Favorite Sports (20% boost)
    if (userPrefs.favoriteSports.includes(context.sport)) {
      multiplier += 0.20;
    }

    // Rule 2: Affinity for Time of Day (15% boost)
    if (userPrefs.preferredTimesOfDay.includes(context.timeOfDay)) {
      multiplier += 0.15;
    }

    // Rule 3: Affinity for Historical Venues (25% boost - loyalty)
    if (userPrefs.historicalVenueIds.includes(context.venueId)) {
      multiplier += 0.25;
    }

    return baseScore * multiplier;
  }

  static applyPersonalization<T extends RankingItem & MatchContext>(
    items: T[], 
    userPrefs: UserPreferences | null
  ): (T & { personalizedScore: number })[] {
    return items.map(item => ({
      ...item,
      // Assume the RankingEngine already assigned a score, but since this is stateless
      // we'll recalculate or assume the item object carries the base score if we computed it.
      // For simplicity, we just pass base score. Assuming qualityScore is the base score here if unranked.
      personalizedScore: this.boostScore(item.qualityScore, item, userPrefs)
    })).sort((a, b) => b.personalizedScore - a.personalizedScore);
  }
}
