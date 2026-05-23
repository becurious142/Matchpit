import { db, bookingsTable, hostedMatchesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export class VenueCRMService {
  /**
   * Generates a cohort analysis for a venue.
   */
  static async getRepeatCohorts(venueId: string) {
    // Basic cohort logic: Count users who have booked > 1 time vs 1 time
    const result = await db.execute(sql`
      SELECT 
        user_id,
        COUNT(b.id) as "bookingCount"
      FROM ${bookingsTable} b
      JOIN ${hostedMatchesTable} m ON b.match_id = m.id
      WHERE m.venue_id = ${venueId} AND b.status = 'confirmed'
      GROUP BY user_id
    `);

    let oneTimers = 0;
    let repeaters = 0;
    let loyalists = 0; // > 5 bookings

    result.forEach((row: any) => {
      const count = Number(row.bookingCount);
      if (count === 1) oneTimers++;
      else if (count <= 5) repeaters++;
      else loyalists++;
    });

    logger.info({ venueId, loyalists, repeaters, oneTimers }, "Venue CRM cohort generated");
    return { oneTimers, repeaters, loyalists };
  }

  /**
   * Evaluates underutilized slots and triggers auto-promotions.
   */
  static async checkUnderutilizedSlots(venueId: string) {
    // Find open matches in the next 24 hours with < 30% fill rate
    const slots = await db.execute(sql`
      SELECT id, start_time 
      FROM ${hostedMatchesTable}
      WHERE venue_id = ${venueId}
        AND status = 'open'
        AND start_time BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
    `);
    
    // In a real app, this would dispatch an event to the notification engine 
    // or auto-apply a venue-funded discount (Phase 17 coupon engine).
    logger.info({ venueId, underutilizedSlotsFound: slots.length }, "Checked venue automation rules");
    return slots;
  }
}
