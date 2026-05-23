import { logger } from "../../lib/logger";
import { UserPreferences } from "./recommendation-engine";

export interface RankingItem {
  id: string;
  createdAt: Date;
  qualityScore: number;     // 0-100 base score (e.g., completeness, images)
  popularityScore: number;  // 0-100 based on bookings/views
  distanceKm?: number;      // distance from user if geo-search
  strikes?: number;         // number of policy violations
  isBoosted?: boolean;      // paid boost or new host boost
  sport?: string;           // Sport type for personalization
  venueId?: string;         // Venue ID for repeat booking affinity
}

/**
 * 70/30 Gravity/Decay Scoring + Anti-Gaming
 * 
 * Score = (BaseQuality * 0.7) + (Popularity * 0.3)
 * Decay: Score decreases based on age (freshness boost for new items)
 * Gravity: Distance penalty
 * Anti-gaming: Severe penalty for items with strikes/reports
 */
export class RankingEngine {
  // Configurable decay constants
  private static readonly DECAY_GRAVITY = 1.8; // Hacker News style gravity
  private static readonly MAX_DISTANCE_PENALTY = 30; // Max points to deduct for distance

  static calculateScore(item: RankingItem, userPrefs?: UserPreferences): number {
    // 1. Base 70/30 split
    let score = (item.qualityScore * 0.7) + (item.popularityScore * 0.3);

    // 2. Freshness Decay (Hacker News algorithm variant)
    // score = (base_score) / (age_in_hours + 2)^gravity
    const ageInHours = Math.max(0, (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60));
    
    // We don't want the score to drop to 0 immediately, so we scale it.
    // Let's use a milder decay for real-world venues/matches.
    const decayFactor = Math.pow(ageInHours + 2, 0.5); 
    score = score / decayFactor;

    // 3. Distance Penalty (Gravity)
    if (item.distanceKm !== undefined) {
      // Deduct 1 point per km, up to max penalty
      const distancePenalty = Math.min(item.distanceKm, this.MAX_DISTANCE_PENALTY);
      score -= distancePenalty;
    }

    // 4. Boosts
    if (item.isBoosted) {
      score *= 1.5; // 50% boost
    }

    // 4b. Personalization Boosts
    if (userPrefs) {
      if (item.sport && userPrefs.favoriteSports.includes(item.sport)) {
        score *= 1.2; // 20% boost for favorite sports
      }
      if (item.venueId && userPrefs.frequentVenues.includes(item.venueId)) {
        score *= 1.3; // 30% boost for frequently visited venues
      }
    }

    // 5. Anti-gaming / Trust & Safety Penalties
    if (item.strikes && item.strikes > 0) {
      // 1 strike = 30% penalty
      // 2 strikes = 60% penalty
      // 3+ strikes = shadowban (score 0)
      const penaltyMultiplier = Math.max(0, 1 - (item.strikes * 0.3));
      score *= penaltyMultiplier;
    }

    // Ensure score doesn't go below 0
    return Math.max(0, score);
  }

  static rank<T extends RankingItem>(items: T[], userPrefs?: UserPreferences): T[] {
    // Calculate and sort in descending order
    return items
      .map(item => ({ item, score: this.calculateScore(item, userPrefs) }))
      .sort((a, b) => b.score - a.score)
      .map(wrapper => wrapper.item);
  }
}
