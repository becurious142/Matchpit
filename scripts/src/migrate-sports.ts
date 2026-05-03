import { db, venuesTable } from "@workspace/db";
import { SPORTS } from "@workspace/db";

const CANONICAL = new Set(SPORTS.map((s) => s.slug));

const SPORT_MAP: Record<string, string | null> = {
  tennis:     "badminton",
  basketball: "football",
  volleyball: "football",
  hockey:     "football",
  squash:     "badminton",
  kabaddi:    null,
};

async function main() {
  console.log("🔧 Migrating venue sports to canonical slugs...\n");

  const venues = await db.select({
    id: venuesTable.id,
    name: venuesTable.name,
    city: venuesTable.city,
    sports: venuesTable.sports,
    isApproved: venuesTable.isApproved,
  }).from(venuesTable);

  let sportFixed = 0;
  let cityFixed = 0;

  for (const venue of venues) {
    const oldSports = venue.sports ?? [];
    const newSports = [...new Set(
      oldSports
        .flatMap((s) => {
          if (CANONICAL.has(s)) return [s];
          const mapped = SPORT_MAP[s];
          if (mapped !== null && mapped !== undefined) return [mapped];
          return [];
        })
    )];

    const sportsChanged =
      oldSports.length !== newSports.length ||
      oldSports.some((s, i) => newSports[i] !== s);

    const needsCityFix = venue.isApproved && venue.city !== "Jaipur";

    if (sportsChanged || needsCityFix) {
      const updates: Record<string, unknown> = {};
      if (sportsChanged) {
        updates.sports = newSports.length > 0 ? newSports : ["football"];
        console.log(`  Sports: "${venue.name}": [${oldSports.join(",")}] → [${newSports.join(",")}]`);
        sportFixed++;
      }
      if (needsCityFix) {
        updates.city = "Jaipur";
        console.log(`  City:   "${venue.name}": "${venue.city}" → "Jaipur"`);
        cityFixed++;
      }
      await db.update(venuesTable).set(updates).where(
        (await import("drizzle-orm")).eq(venuesTable.id, venue.id)
      );
    }
  }

  console.log(`\n✅  Done. ${sportFixed} sport fixes, ${cityFixed} city fixes.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
