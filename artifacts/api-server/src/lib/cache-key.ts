import { env } from "../config/env";
import { getGeohash } from "./geohash";

const envPrefix = env.NODE_ENV || "development";

export function buildVenueCacheKey(latitude: number, longitude: number, radiusKm: number, sport: string, page: number): string {
  const hash = getGeohash(latitude, longitude, 6);
  const safeSport = sport || "all";
  return `matchpit:${envPrefix}:discovery:nearby_venues:${hash}:${radiusKm}:${safeSport}:${page}`;
}

export function buildMatchCacheKey(latitude: number, longitude: number, radiusKm: number, sport: string, page: number): string {
  const hash = getGeohash(latitude, longitude, 6);
  const safeSport = sport || "all";
  return `matchpit:${envPrefix}:discovery:nearby_matches:${hash}:${radiusKm}:${safeSport}:${page}`;
}
