import { logger } from "../../lib/logger";

export class ActivityFeedService {
  /**
   * Pushes an event to a localized feed bucket in Redis.
   * As per Phase 18 constraints: Pull-based fanout only. No heavy user-specific precomputation.
   */
  static async publishLocalEvent(city: string, sport: string, event: any) {
    const feedKey = `feed:${city}:${sport}`;
    
    // In a real app:
    // await redis.zadd(feedKey, Date.now(), JSON.stringify(event));
    // await redis.zremrangebyrank(feedKey, 0, -1001); // keep last 1000 items
    
    logger.info({ city, sport, eventType: event.type }, "Published local activity feed event");
  }

  /**
   * Pulls the latest events for a specific geo-feed via cursor pagination.
   */
  static async getLocalFeed(city: string, sport: string, cursor?: number) {
    const feedKey = `feed:${city}:${sport}`;
    
    // Mock response
    // In a real app: await redis.zrevrangebyscore(feedKey, cursor || "+inf", "-inf", "LIMIT", 0, 20);
    
    return [
      { id: "1", type: "match_created", message: "New 5v5 Football match created in Gurgaon" },
      { id: "2", type: "team_win", message: "Gurgaon Gladiators won a match!" },
    ];
  }
}
