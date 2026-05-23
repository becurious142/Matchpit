import { logger } from "../../lib/logger";
import { NotificationCampaigns } from "./notification-campaigns";

export type NotificationPriority = "high" | "medium" | "low";

export interface NotificationEventContext {
  userId: string;
  eventType: string;
  priority: NotificationPriority;
  payload: any;
}

// Mock dispatcher for Phase 17 scaffolding
class NotificationDispatcher {
  static async dispatchHighPriority(context: NotificationEventContext) {
    logger.info({ userId: context.userId }, "Dispatched HIGH priority notification (Email -> In-app -> WhatsApp)");
  }
  static async dispatchMediumPriority(context: NotificationEventContext) {
    logger.info({ userId: context.userId }, "Dispatched MEDIUM priority notification");
  }
}

export class NotificationRulesEngine {
  /**
   * Applies throttling and routing rules based on the event priority.
   * Prevents notification fatigue for low/medium priority events.
   */
  static async evaluateAndRoute(context: NotificationEventContext) {
    logger.info({ userId: context.userId, eventType: context.eventType }, "Evaluating notification rules");

    // We fetch user notification preferences from DB here in a real implementation
    // Example: const userPrefs = await db.select()...

    if (context.priority === "high") {
      // High Priority: Confirmations, Waitlist, Reminders, Failures
      // Route immediately via all essential channels
      await NotificationDispatcher.dispatchHighPriority(context);
    } else if (context.priority === "medium") {
      // Medium Priority: Abandoned cart, Referral unlocks
      // Check throttle limits (e.g. max 2 medium/day)
      const allowed = await this.checkThrottle(context.userId, "medium");
      if (allowed) {
        await NotificationDispatcher.dispatchMediumPriority(context);
      } else {
        logger.debug({ userId: context.userId }, "Medium priority notification throttled");
      }
    } else if (context.priority === "low") {
      // Low Priority: Marketing drips, "Come back" campaigns
      // Batch or schedule these during optimal engagement windows
      await NotificationCampaigns.scheduleLowPriority(context);
    }
  }

  private static async checkThrottle(userId: string, tier: string): Promise<boolean> {
    // In production, this checks a Redis counter: `throttle:notify:${tier}:${userId}`
    return true; // Placeholder for logic
  }
}
