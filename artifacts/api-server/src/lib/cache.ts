import { getQueueConnection } from "../queues/redis";
import { logger } from "./logger";
import { CacheMonitor } from "./cache-monitor";

const redis = getQueueConnection();

export interface CacheEntry<T> {
  data: T;
  createdAt: number;
}

export const CacheStrategy = {
  async getStaleWhileRevalidate<T>(
    key: string,
    softTtlSec: number,
    hardTtlSec: number,
    fetchFn: () => Promise<T>,
    backgroundRefreshFn: () => void
  ): Promise<T> {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry<T>;
        const ageSec = (Date.now() - entry.createdAt) / 1000;
        
        if (ageSec > hardTtlSec) {
          CacheMonitor.recordMiss();
        } else {
          CacheMonitor.recordHit();
          if (ageSec > softTtlSec) {
            logger.debug({ key }, "Cache soft-miss (SWR trigger)");
            backgroundRefreshFn();
          } else {
            logger.debug({ key }, "Cache hit");
          }
          return entry.data;
        }
      } else {
        CacheMonitor.recordMiss();
      }
    } catch (err) {
      logger.error({ err, key }, "Redis cache get error");
    }

    // Cache miss or hard expired
    const data = await fetchFn();
    try {
      const entry: CacheEntry<T> = { data, createdAt: Date.now() };
      const payloadString = JSON.stringify(entry);

      if (CacheMonitor.isPayloadSafe(payloadString)) {
        await redis.setex(key, hardTtlSec, payloadString);
      }
    } catch (err) {
      logger.error({ err, key }, "Redis cache set error");
    }

    return data;
  },

  async set<T>(key: string, data: T, hardTtlSec: number): Promise<void> {
    try {
      const entry: CacheEntry<T> = { data, createdAt: Date.now() };
      const payloadString = JSON.stringify(entry);
      if (CacheMonitor.isPayloadSafe(payloadString)) {
        await redis.setex(key, hardTtlSec, payloadString);
      }
    } catch (err) {
      logger.error({ err, key }, "Redis cache set error");
    }
  }
};
