export const SPORTS = [
  { slug: "cricket",     label: "Cricket",     icon: "🏏" },
  { slug: "box_cricket", label: "Box Cricket",  icon: "📦" },
  { slug: "football",    label: "Football",     icon: "⚽" },
  { slug: "badminton",   label: "Badminton",    icon: "🏸" },
  { slug: "pickleball",  label: "Pickleball",   icon: "🏓" },
] as const;

export type SportSlug = (typeof SPORTS)[number]["slug"];
export const SPORT_SLUGS = SPORTS.map((s) => s.slug);

export function getSportMeta(slug: string) {
  return SPORTS.find((s) => s.slug === slug) ?? null;
}
