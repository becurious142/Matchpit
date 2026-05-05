/**
 * Canonical sport slug → human-readable label mapping.
 * Use this everywhere a sport slug is displayed to a user.
 */
const SPORT_LABELS: Record<string, string> = {
  cricket: "Cricket",
  box_cricket: "Box Cricket",
  football: "Football",
  badminton: "Badminton",
  pickleball: "Pickleball",
  basketball: "Basketball",
  volleyball: "Volleyball",
  tennis: "Tennis",
  hockey: "Hockey",
};

/**
 * Convert a sport slug (e.g. "box_cricket") to a human label ("Box Cricket").
 * Falls back to title-casing the slug with spaces if not in the map.
 */
export function formatSportLabel(slug: string): string {
  if (!slug) return "";
  return (
    SPORT_LABELS[slug] ??
    slug
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Sport-specific fallback image paths for venues with no cover image.
 * Returns a deterministic path based on the primary sport.
 */
const SPORT_FALLBACK_IMAGES: Record<string, string> = {
  cricket: "/venues/venue1.png",
  box_cricket: "/venues/venue1.png",
  football: "/venues/venue2.png",
  badminton: "/venues/venue3.png",
  pickleball: "/venues/venue3.png",
  basketball: "/venues/venue4.png",
  volleyball: "/venues/venue4.png",
  tennis: "/venues/venue4.png",
};

/**
 * Get a deterministic fallback image for a venue based on its sports array.
 * Uses the first sport in the array, falls back to index-based cycling.
 */
export function getVenueFallbackImage(sports: string[], index = 0): string {
  const primarySport = sports?.[0];
  if (primarySport && SPORT_FALLBACK_IMAGES[primarySport]) {
    return SPORT_FALLBACK_IMAGES[primarySport];
  }
  // Cycle through 4 venue images as last resort
  return `/venues/venue${(index % 4) + 1}.png`;
}
