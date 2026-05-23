import { db, userSubscriptionsTable, plansTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export class SubscriptionsService {
  /**
   * Evaluates all entitlements for a user centrally.
   * As per Phase 18 constraints, NEVER scatter `if (isPremium)` checks.
   */
  static async getUserEntitlements(userId: string) {
    // Default base entitlements
    const entitlements: Record<string, any> = {
      waitlistPriorityBoost: 0,
      feeDiscountPct: 0,
      earlyBookingHours: 0,
      canViewVenueAnalytics: false,
    };

    const subscriptions = await db.execute(sql`
      SELECT p.entitlements 
      FROM ${userSubscriptionsTable} us
      JOIN ${plansTable} p ON us.plan_id = p.id
      WHERE us.user_id = ${userId}
        AND us.status = 'active'
        AND us.current_period_end > NOW()
    `);

    // Merge entitlements across active plans
    for (const sub of subscriptions) {
      const planEntitlements = sub.entitlements as Record<string, any>;
      if (planEntitlements) {
        if (planEntitlements.waitlistPriorityBoost) {
          entitlements.waitlistPriorityBoost = Math.max(entitlements.waitlistPriorityBoost, planEntitlements.waitlistPriorityBoost);
        }
        if (planEntitlements.feeDiscountPct) {
          entitlements.feeDiscountPct = Math.max(entitlements.feeDiscountPct, planEntitlements.feeDiscountPct);
        }
        if (planEntitlements.earlyBookingHours) {
          entitlements.earlyBookingHours = Math.max(entitlements.earlyBookingHours, planEntitlements.earlyBookingHours);
        }
        if (planEntitlements.canViewVenueAnalytics) {
          entitlements.canViewVenueAnalytics = true;
        }
      }
    }

    return entitlements;
  }
}
