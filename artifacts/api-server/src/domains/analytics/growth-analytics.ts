import { logger } from "../../lib/logger";
import { promRegistry } from "../../lib/metrics";
import * as promClient from "prom-client";

// Prometheus Metrics
const referralConversionCounter = new promClient.Counter({
  name: "matchpit_referral_conversions_total",
  help: "Total number of successful referral conversions",
  labelNames: ["city"],
  registers: [promRegistry],
});

const waitlistFillCounter = new promClient.Counter({
  name: "matchpit_waitlist_fills_total",
  help: "Total number of waitlist auto-promotions that resulted in a booking",
  labelNames: ["sport"],
  registers: [promRegistry],
});

const couponUsageCounter = new promClient.Counter({
  name: "matchpit_coupon_usage_total",
  help: "Total number of coupons used",
  labelNames: ["funded_by", "type"],
  registers: [promRegistry],
});

export class GrowthAnalytics {
  /**
   * Tracks a successful referral conversion in Prometheus and PostHog.
   */
  static trackReferralConversion(userId: string, referrerId: string, city: string) {
    // Prometheus for ops alerts
    referralConversionCounter.labels(city).inc();
    
    // PostHog for product analytics (placeholder)
    logger.info({ event: "referral_converted", userId, referrerId, city }, "Growth Event");
  }

  /**
   * Tracks when a waitlist slot actually converts to revenue.
   */
  static trackWaitlistFill(userId: string, matchId: string, sport: string) {
    waitlistFillCounter.labels(sport).inc();
    logger.info({ event: "waitlist_filled", userId, matchId, sport }, "Growth Event");
  }

  /**
   * Tracks coupon usage for subsidy monitoring.
   */
  static trackCouponUsage(userId: string, code: string, fundedBy: string, type: string, discountAmount: number) {
    couponUsageCounter.labels(fundedBy, type).inc();
    logger.info({ event: "coupon_used", userId, code, fundedBy, type, discountAmount }, "Growth Event");
  }
}
