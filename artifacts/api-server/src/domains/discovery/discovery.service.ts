import { geoRepository } from "../geo/geo.repository";
import { DiscoveryQuery } from "./discovery.types";
import { CacheStrategy } from "../../lib/cache";
import { buildVenueCacheKey, buildMatchCacheKey } from "../../lib/cache-key";
import { cacheRefreshQueue } from "../../queues/queues";
import { logger } from "../../lib/logger";
import { encodeGeoCursor } from "../../lib/pagination/cursor";

export class DiscoveryService {
  async getNearbyVenues(query: DiscoveryQuery) {
    const page = query.cursor ? 2 : 1; 
    const cacheKey = buildVenueCacheKey(query.lat, query.lng, query.radiusKm, query.sport ?? "", page);

    const data = await CacheStrategy.getStaleWhileRevalidate(
      cacheKey,
      30, // 30s soft TTL
      120, // 120s hard TTL
      async () => {
        const result = await geoRepository.findNearbyVenues(query.lat, query.lng, query.radiusKm * 1000, query.cursor);
        return this.formatPaginatedResult(result.rows, result.snapshotTs, query.limit);
      },
      () => {
        cacheRefreshQueue().add("refresh-venues", { key: cacheKey, type: "venues", query });
      }
    );

    return data;
  }

  async getNearbyMatches(query: DiscoveryQuery) {
    const page = query.cursor ? 2 : 1; 
    const cacheKey = buildMatchCacheKey(query.lat, query.lng, query.radiusKm, query.sport ?? "", page);

    const data = await CacheStrategy.getStaleWhileRevalidate(
      cacheKey,
      30, // 30s soft TTL
      120, // 120s hard TTL
      async () => {
        const result = await geoRepository.findNearbyMatches(query.lat, query.lng, query.radiusKm * 1000, query.cursor);
        return this.formatPaginatedResult(result.rows, result.snapshotTs, query.limit);
      },
      () => {
        cacheRefreshQueue().add("refresh-matches", { key: cacheKey, type: "matches", query });
      }
    );

    return data;
  }

  private formatPaginatedResult(rows: any[], snapshotTs: string, limit: number) {
    let nextCursor: string | null = null;
    let items = rows;

    if (items.length > limit) {
      items = items.slice(0, limit);
      const lastItem = items[items.length - 1];
      nextCursor = encodeGeoCursor({
        score: lastItem.score,
        distanceMeters: lastItem.distance_meters,
        createdAt: lastItem.created_at.toISOString(),
        id: lastItem.id,
        snapshotTs,
      });
    } else if (items.length > 0) {
      // Still generate a cursor even if it's the last page so clients know snapshotTs
      // but usually if items < limit, there is no next page.
      // We will leave nextCursor as null if items <= limit to indicate end of feed.
    }

    return {
      items,
      nextCursor,
      snapshotTs,
    };
  }

  async refreshVenuesCache(query: DiscoveryQuery, cacheKey: string) {
    const result = await geoRepository.findNearbyVenues(query.lat, query.lng, query.radiusKm * 1000, query.cursor);
    const data = this.formatPaginatedResult(result.rows, result.snapshotTs, query.limit);
    await CacheStrategy.set(cacheKey, data, 120);
    logger.info({ cacheKey }, "Venues cache refreshed");
  }

  async refreshMatchesCache(query: DiscoveryQuery, cacheKey: string) {
    const result = await geoRepository.findNearbyMatches(query.lat, query.lng, query.radiusKm * 1000, query.cursor);
    const data = this.formatPaginatedResult(result.rows, result.snapshotTs, query.limit);
    await CacheStrategy.set(cacheKey, data, 120);
    logger.info({ cacheKey }, "Matches cache refreshed");
  }
}

export const discoveryService = new DiscoveryService();
