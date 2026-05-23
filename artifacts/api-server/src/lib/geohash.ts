import ngeohash from "ngeohash";

/**
 * Returns a geohash for the given coordinates.
 * Precision 6 is approximately 1.2km x 0.6km.
 */
export function getGeohash(latitude: number, longitude: number, precision: number = 6): string {
  return ngeohash.encode(latitude, longitude, precision);
}

/**
 * Truncates a coordinate to the specified number of decimals.
 * 4 decimals is approximately 11.1 meters at the equator.
 * This is used for privacy-safe storage in user_locations.
 */
export function truncateCoordinate(coord: number, decimals: number = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(coord * factor) / factor;
}
