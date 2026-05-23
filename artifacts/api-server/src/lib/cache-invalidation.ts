import { getQueueConnection } from "../queues/redis";
import ngeohash from "ngeohash";
import { logger } from "./logger";
import { cacheRefreshQueue } from "../queues/queues";
import { env } from "../config/env";

const redis = getQueueConnection();

/**
 * Gets the center geohash and all 8 neighboring geohashes
 * at the given precision.
 */
export function getNeighboringGeohashes(lat: number, lng: number, precision: number = 6): string[] {
  const center = ngeohash.encode(lat, lng, precision);
  const neighbors = ngeohash.neighbors(center);
  return [center, ...neighbors];
}

/**
 * Invalidates cache for a specific sport across neighboring geohashes
 * and triggers prewarming jobs.
 */
export async function invalidateDiscoveryGeohashes(
  lat: number, 
  lng: number, 
  sport: string, 
  precision: number = 6
): Promise<void> {
  const hashes = getNeighboringGeohashes(lat, lng, precision);
  
  // Pattern: nearby_venues:{geohash}:{radius}:{sport}:{page}
  // To avoid `KEYS`, we can use `UNLINK` directly on known common keys if possible,
  // or use `SCAN` to find keys matching the geohash pattern.
  // For safety and performance at scale, we use Lua scripts or SCAN.
  
  const pipeline = redis.pipeline();
  
  for (const hash of hashes) {
    // We scan for `nearby_venues:${hash}:*:${sport}:*` and `nearby_matches:${hash}:*:${sport}:*`
    // Wait, scanning all keys is bad in Redis.
    // Instead of scanning, we can just delete the entire hash namespace if we maintained a SET of keys per geohash,
    // or since radius is typically 10,20,50 and page 1,2,3 we can optimistically UNLINK them.
    // Let's optimistic UNLINK for common radiuses (10, 20, 50) and pages (1, 2, 3) to be fast.
    const commonRadiuses = [10, 20, 50];
    const commonPages = [1, 2, 3];
    
    for (const radius of commonRadiuses) {
      for (const page of commonPages) {
        pipeline.unlink(`nearby_venues:${hash}:${radius}:${sport}:${page}`);
        pipeline.unlink(`nearby_matches:${hash}:${radius}:${sport}:${page}`);
      }
    }

    if (env.ENABLE_CACHE_PREWARMING) {
      // Dispatch prewarm jobs for page 1 of common radiuses
      for (const radius of commonRadiuses) {
        cacheRefreshQueue().add("prewarm-discovery", {
          lat,
          lng,
          sport,
          radiusKm: radius,
          type: "venues"
        }, {
          jobId: `prewarm:venues:${hash}:${sport}:${radius}`,
          removeOnComplete: true,
          removeOnFail: true,
        });

        cacheRefreshQueue().add("prewarm-discovery", {
          lat,
          lng,
          sport,
          radiusKm: radius,
          type: "matches"
        }, {
          jobId: `prewarm:matches:${hash}:${sport}:${radius}`,
          removeOnComplete: true,
          removeOnFail: true,
        });
      }
    }
  }

  try {
    await pipeline.exec();
    logger.debug({ lat, lng, sport, hashes }, "Invalidated neighboring geohash caches");
  } catch (err) {
    logger.error({ err, lat, lng, sport }, "Failed to invalidate caches");
  }
}
