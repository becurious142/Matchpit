import { getQueueConnection } from "../queues/redis";
import { logger } from "./logger";
import { env } from "../config/env";

const redis = getQueueConnection();

const PRESENCE_TTL_SECONDS = 90; // heartbeat interval * 6
const MAX_VIEWERS_PER_MATCH = 500;
const KEY_PREFIX = "presence:match:";

export const Presence = {
  async join(matchId: string, userId: string): Promise<number> {
    if (!env.ENABLE_PRESENCE) return 0;
    const key = `${KEY_PREFIX}${matchId}`;
    const memberKey = `${key}:member:${userId}`;

    // Store member with TTL
    await redis.set(memberKey, "1", "EX", PRESENCE_TTL_SECONDS);

    // Add userId to the match set with score = expiry timestamp
    const expiryScore = Date.now() + PRESENCE_TTL_SECONDS * 1000;
    await redis.zadd(key, expiryScore, userId);

    // Cap cardinality: remove oldest if exceeds max
    const count = await redis.zcard(key);
    if (count > MAX_VIEWERS_PER_MATCH) {
      // Remove the oldest (lowest score)
      await redis.zpopmin(key);
    }

    const active = await redis.zcard(key);
    logger.debug({ matchId, userId, active }, "Presence: user joined");
    return active;
  },

  async leave(matchId: string, userId: string): Promise<number> {
    if (!env.ENABLE_PRESENCE) return 0;
    const key = `${KEY_PREFIX}${matchId}`;
    await redis.zrem(key, userId);
    await redis.del(`${key}:member:${userId}`);
    const active = await redis.zcard(key);
    logger.debug({ matchId, userId, active }, "Presence: user left");
    return active;
  },

  async heartbeat(matchId: string, userId: string): Promise<void> {
    if (!env.ENABLE_PRESENCE) return;
    const key = `${KEY_PREFIX}${matchId}`;
    const memberKey = `${key}:member:${userId}`;

    // Refresh TTL on per-member key
    await redis.expire(memberKey, PRESENCE_TTL_SECONDS);
    // Update score (timestamp) so the member stays fresh
    const expiryScore = Date.now() + PRESENCE_TTL_SECONDS * 1000;
    await redis.zadd(key, expiryScore, userId);
  },

  async getCount(matchId: string): Promise<number> {
    if (!env.ENABLE_PRESENCE) return 0;
    // Prune expired members before counting
    await redis.zremrangebyscore(`${KEY_PREFIX}${matchId}`, "-inf", Date.now());
    return redis.zcard(`${KEY_PREFIX}${matchId}`);
  },

  async getViewers(matchId: string): Promise<string[]> {
    if (!env.ENABLE_PRESENCE) return [];
    await redis.zremrangebyscore(`${KEY_PREFIX}${matchId}`, "-inf", Date.now());
    return redis.zrangebyscore(`${KEY_PREFIX}${matchId}`, Date.now(), "+inf");
  },

  /**
   * GC: prune all expired presence sets across all matches.
   * Designed to be called by a recurring worker (every 60s).
   */
  async gc(): Promise<void> {
    if (!env.ENABLE_PRESENCE) return;
    const now = Date.now();

    // Scan all match presence keys
    let cursor = "0";
    let pruned = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${KEY_PREFIX}*`, "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        // Skip member sub-keys
        if (key.includes(":member:")) continue;
        const removed = await redis.zremrangebyscore(key, "-inf", now);
        pruned += removed;

        // Optionally remove empty sets
        const remaining = await redis.zcard(key);
        if (remaining === 0) {
          await redis.del(key);
        }
      }
    } while (cursor !== "0");

    logger.info({ pruned }, "Presence GC: pruned expired members");
  },
};
