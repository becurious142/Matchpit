import { getQueueConnection } from "../queues/redis";
import { logger } from "./logger";

const redis = getQueueConnection();

export const CacheMonitor = {
  metrics: {
    hits: 0,
    misses: 0,
    oversizedRejections: 0,
  },

  /**
   * Tracks cache hit/miss in memory for /admin/metrics
   */
  recordHit() {
    this.metrics.hits++;
  },

  recordMiss() {
    this.metrics.misses++;
  },

  /**
   * Validates if a string payload is safe to cache.
   * Rejects > 500KB payloads to protect Redis memory.
   */
  isPayloadSafe(payloadStr: string): boolean {
    const sizeBytes = Buffer.byteLength(payloadStr, "utf8");
    if (sizeBytes > 500 * 1024) { // 500 KB limit
      this.metrics.oversizedRejections++;
      logger.warn({ sizeBytes }, "Cache write rejected: oversized payload");
      return false;
    }
    return true;
  },

  async getRedisMemoryUsage(): Promise<string> {
    try {
      const info = await redis.info("memory");
      const match = info.match(/used_memory_human:(.*)/);
      return match ? match[1].trim() : "unknown";
    } catch {
      return "error";
    }
  }
};
