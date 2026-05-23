import {
  db,
  venuesTable,
  slotsTable,
  citiesTable,
  profilesTable,
  financialLedgerTable,
  walletLedgerTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { randomUUID } from "crypto";

// Bounding boxes for realistic geohashes
const REGIONS = [
  { name: "Jaipur",  latMin: 26.75, latMax: 26.95, lngMin: 75.70, lngMax: 75.90, weight: 0.4 },
  { name: "Gurgaon", latMin: 28.35, latMax: 28.50, lngMin: 76.95, lngMax: 77.10, weight: 0.3 },
  { name: "Delhi",   latMin: 28.50, latMax: 28.75, lngMin: 77.10, lngMax: 77.30, weight: 0.3 },
];

function getRandomRegion() {
  const rand = Math.random();
  let cumulative = 0;
  for (const region of REGIONS) {
    cumulative += region.weight;
    if (rand <= cumulative) return region;
  }
  return REGIONS[0];
}

function getRandomCoordinate(min: number, max: number) {
  return min + Math.random() * (max - min);
}

async function seedCities() {
  const cityData = REGIONS.map(r => ({
    cityName: r.name,
    slug: r.name.toLowerCase(),
    isActive: true,
    launchPriority: 1,
  }));
  await db.insert(citiesTable).values(cityData).onConflictDoNothing();
  console.log(`✅ Seeded Cities`);
}

async function seedProfiles(count: number) {
  const batchSize = 1000;
  let inserted = 0;
  console.log(`Seeding ${count} profiles...`);
  
  for (let i = 0; i < count; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && (i + j) < count; j++) {
      batch.push({
        id: randomUUID(),
        clerkId: `clerk_${randomUUID()}`,
        phone: `+91999${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
        displayName: `TestUser_${i+j}`,
        walletBalance: "5000.00",
      });
    }
    await db.insert(profilesTable).values(batch).onConflictDoNothing();
    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${count} profiles`);
  }
  console.log(`\n✅ Seeded ${count} profiles`);
}

async function seedVenuesAndSlots(venueCount: number) {
  const batchSize = 500;
  let inserted = 0;
  console.log(`Seeding ${venueCount} venues and slots...`);
  
  const allCities = await db.select().from(citiesTable);
  const cityMap = new Map(allCities.map(c => [c.cityName, c.id]));

  for (let i = 0; i < venueCount; i += batchSize) {
    const venuesBatch = [];
    const currentBatchSize = Math.min(batchSize, venueCount - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const region = getRandomRegion();
      const lat = getRandomCoordinate(region.latMin, region.latMax);
      const lng = getRandomCoordinate(region.lngMin, region.lngMax);
      const cityId = cityMap.get(region.name) || null;
      
      venuesBatch.push({
        id: randomUUID(),
        name: `Test Venue ${i+j}`,
        city: region.name,
        cityId,
        address: `${Math.floor(Math.random() * 1000)} Random St, ${region.name}`,
        sports: ["football", "cricket", "badminton"],
        pricePerHour: "1000",
        weekdayMorningPrice: 800,
        weekdayDayPrice: 800,
        weekdayEveningPrice: 1200,
        weekendPrice: 1500,
        coordinates: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)` as any,
        isApproved: true,
      });
    }
    
    await db.insert(venuesTable).values(venuesBatch).onConflictDoNothing();
    inserted += currentBatchSize;
    process.stdout.write(`\rInserted ${inserted}/${venueCount} venues`);
  }
  console.log(`\n✅ Seeded ${venueCount} venues`);
}

async function main() {
  console.log("🚀 Starting Production Scale Seed...");
  const targetVenues = 100000;
  const targetProfiles = 10000;
  
  await seedCities();
  await seedProfiles(targetProfiles);
  await seedVenuesAndSlots(targetVenues);
  
  console.log("\n🎉 Production Scale Seeding Complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
