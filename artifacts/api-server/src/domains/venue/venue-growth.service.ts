import { db, bookingsTable, hostedMatchesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export interface PricingRecommendation {
  hour: number;
  currentPrice: number;
  recommendedPrice: number;
  demandFactor: "low" | "normal" | "high" | "peak";
}

export class VenueGrowthService {
  /**
   * Generates peak-hour analytics and manual dynamic pricing recommendations.
   * As per Phase 17 constraints: Expose recommendations ONLY. Do NOT auto-mutate prices.
   */
  static async getPricingRecommendations(venueId: string): Promise<PricingRecommendation[]> {
    logger.info({ venueId }, "Generating pricing recommendations for venue");

    // 1. Analyze historical demand for the past 30 days
    const demandStats = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM m.start_time) as "hourOfDay",
        COUNT(b.id) as "bookingCount",
        AVG(b.amount) as "avgPrice"
      FROM ${hostedMatchesTable} m
      LEFT JOIN ${bookingsTable} b ON b.match_id = m.id AND b.status = 'confirmed'
      WHERE m.venue_id = ${venueId}
        AND m.start_time >= NOW() - INTERVAL '30 days'
      GROUP BY "hourOfDay"
      ORDER BY "hourOfDay" ASC
    `);

    // 2. Generate recommendations (simplified logic)
    const recommendations: PricingRecommendation[] = [];
    
    // Baseline expectations (e.g. 5 bookings = normal)
    for (const stat of demandStats) {
      const hour = Number(stat.hourOfDay);
      const bookingCount = Number(stat.bookingCount);
      const currentPrice = Number(stat.avgPrice || 100);

      let demandFactor: "low" | "normal" | "high" | "peak" = "normal";
      let recommendedPrice = currentPrice;

      if (bookingCount > 20) {
        demandFactor = "peak";
        recommendedPrice = currentPrice * 1.2; // Suggest 20% increase
      } else if (bookingCount > 10) {
        demandFactor = "high";
        recommendedPrice = currentPrice * 1.1; // Suggest 10% increase
      } else if (bookingCount < 3) {
        demandFactor = "low";
        recommendedPrice = currentPrice * 0.9; // Suggest 10% discount to drive occupancy
      }

      recommendations.push({
        hour,
        currentPrice: Math.round(currentPrice),
        recommendedPrice: Math.round(recommendedPrice),
        demandFactor
      });
    }

    return recommendations;
  }

  /**
   * Estimates expected weekly payouts based on upcoming confirmed bookings.
   */
  static async forecastWeeklyPayout(venueId: string): Promise<{ expectedPayout: number }> {
    const [{ expectedPayout }] = await db.execute(sql`
      SELECT SUM(b.amount) as "expectedPayout"
      FROM ${bookingsTable} b
      JOIN ${hostedMatchesTable} m ON b.match_id = m.id
      WHERE m.venue_id = ${venueId}
        AND b.status = 'confirmed'
        AND m.start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    `);

    return { expectedPayout: Number(expectedPayout || 0) };
  }
}
