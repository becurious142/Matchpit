import { NotificationEventContext } from "./notification-rules";
import { getQueueConnection } from "../../queues/redis";
import { Queue } from "bullmq";
import { logger } from "../../lib/logger";

const connection = getQueueConnection();
const lowPriorityQueue = new Queue("low-priority-notifications", { connection });

export class NotificationCampaigns {
  /**
   * Schedules a low priority notification (e.g., drip campaign, come back reminder).
   * These are delayed to optimal dispatch times (e.g. daytime hours) to prevent annoyance.
   */
  static async scheduleLowPriority(context: NotificationEventContext) {
    logger.info({ userId: context.userId, eventType: context.eventType }, "Scheduling low priority notification campaign");

    // Add to a background queue with a delay, or process during a daily cron
    await lowPriorityQueue.add("dispatch", context, {
      delay: 1000 * 60 * 60 * 24, // Example: delay 24 hours
      removeOnComplete: true,
    });
  }
}
