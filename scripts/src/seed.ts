import {
  db,
  venuesTable,
  slotsTable,
  citiesTable,
  ownerLeadsTable,
  profilesTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  referralConfigTable,
} from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { requireDatabaseUrl } from "./load-env.js";
import { closePool } from "@workspace/db";

requireDatabaseUrl();

const JAIPUR_VENUES = [
  {
    name: "Malviya Nagar Turf Zone",
    address: "B-42, Malviya Nagar, Jaipur",
    sports: ["football", "cricket", "badminton"],
    pricePerHour: "900",
    weekdayMorningPrice: 900,
    weekdayDayPrice: 700,
    weekdayEveningPrice: 1200,
    weekendPrice: 1500,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "23:00",
    amenities: ["Floodlights", "Changing Rooms", "Parking", "Water"],
    description:
      "Premium multi-sport turf in the heart of Malviya Nagar with professional-grade synthetic grass.",
    coverImage:
      "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80",
    rating: "4.7",
    totalReviews: 52,
    isFeatured: true,
    isApproved: true,
  },
  {
    name: "Vaishali Nagar Sports Hub",
    address: "Plot 12, Vaishali Nagar, Jaipur",
    sports: ["football", "pickleball"],
    pricePerHour: "800",
    weekdayMorningPrice: 800,
    weekdayDayPrice: 600,
    weekdayEveningPrice: 1000,
    weekendPrice: 1300,
    slotIntervalMins: 60,
    openTime: "05:30",
    closeTime: "22:00",
    amenities: ["Floodlights", "Parking", "Cafeteria"],
    description: "Spacious sports complex with dedicated pickleball courts.",
    coverImage:
      "https://images.unsplash.com/photo-1551958219-acbc595d9e47?w=800&q=80",
    rating: "4.6",
    totalReviews: 38,
    isFeatured: true,
    isApproved: true,
  },
  {
    name: "Mansarovar Cricket Arena",
    address: "Sector 5, Mansarovar, Jaipur",
    sports: ["cricket", "box_cricket"],
    pricePerHour: "1200",
    weekdayMorningPrice: 1200,
    weekdayDayPrice: 900,
    weekdayEveningPrice: 1600,
    weekendPrice: 2000,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "23:00",
    amenities: ["Floodlights", "Practice Nets", "Changing Rooms", "Parking"],
    description: "Full-size cricket ground and dedicated box cricket cages.",
    coverImage:
      "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80",
    rating: "4.8",
    totalReviews: 94,
    isFeatured: true,
    isApproved: true,
  },
  {
    name: "Jagatpura Football Ground",
    address: "Near Sitapura RIICO, Jagatpura, Jaipur",
    sports: ["football", "badminton"],
    pricePerHour: "700",
    weekdayMorningPrice: 700,
    weekdayDayPrice: 500,
    weekdayEveningPrice: 900,
    weekendPrice: 1200,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "22:30",
    amenities: ["Floodlights", "Parking", "Water"],
    description: "FIFA-grade synthetic turf for 5-a-side and 7-a-side football.",
    coverImage:
      "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80",
    rating: "4.5",
    totalReviews: 67,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "C-Scheme Badminton Club",
    address: "C-78, C-Scheme, Jaipur",
    sports: ["badminton", "pickleball"],
    pricePerHour: "600",
    weekdayMorningPrice: 600,
    weekdayDayPrice: 450,
    weekdayEveningPrice: 800,
    weekendPrice: 1000,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "22:00",
    amenities: ["Air Conditioning", "Changing Rooms", "Coaching Available"],
    description: "Professional indoor badminton facility with 6 courts.",
    coverImage:
      "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80",
    rating: "4.9",
    totalReviews: 121,
    isFeatured: true,
    isApproved: true,
  },
  {
    name: "Raja Park Sports Complex",
    address: "1A, Raja Park Main Road, Jaipur",
    sports: ["cricket", "football", "badminton"],
    pricePerHour: "1000",
    weekdayMorningPrice: 1000,
    weekdayDayPrice: 750,
    weekdayEveningPrice: 1400,
    weekendPrice: 1800,
    slotIntervalMins: 60,
    openTime: "05:00",
    closeTime: "23:30",
    amenities: ["Floodlights", "Parking", "Cafeteria", "Changing Rooms", "CCTV"],
    description: "Jaipur's biggest multi-sport complex.",
    coverImage:
      "https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80",
    rating: "4.7",
    totalReviews: 203,
    isFeatured: true,
    isApproved: true,
  },
  {
    name: "Tonk Road Turf Arena",
    address: "Near Malviya Industrial Area, Tonk Road, Jaipur",
    sports: ["football", "cricket"],
    pricePerHour: "750",
    weekdayMorningPrice: 750,
    weekdayDayPrice: 550,
    weekdayEveningPrice: 1000,
    weekendPrice: 1300,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "22:00",
    amenities: ["Floodlights", "Parking", "Water"],
    description: "Well-maintained turf arena with wide open space.",
    coverImage:
      "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80",
    rating: "4.4",
    totalReviews: 44,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Malviya Nagar Pickleball Court",
    address: "D-102, Malviya Nagar Extension, Jaipur",
    sports: ["pickleball", "badminton"],
    pricePerHour: "650",
    weekdayMorningPrice: 650,
    weekdayDayPrice: 500,
    weekdayEveningPrice: 850,
    weekendPrice: 1100,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "21:00",
    amenities: ["Air Conditioning", "Equipment Rental", "Coaching"],
    description: "Jaipur's first dedicated pickleball facility.",
    coverImage:
      "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80",
    rating: "4.8",
    totalReviews: 29,
    isFeatured: false,
    isApproved: true,
  },
];

const CITY_MASTER = [
  { cityName: "Jaipur", slug: "jaipur", isActive: true, launchPriority: 1 },
  { cityName: "Delhi", slug: "delhi", isActive: false, launchPriority: 2 },
  { cityName: "Gurgaon", slug: "gurgaon", isActive: false, launchPriority: 3 },
  { cityName: "Noida", slug: "noida", isActive: false, launchPriority: 4 },
  { cityName: "Mumbai", slug: "mumbai", isActive: false, launchPriority: 5 },
];

const DEMO_PROFILES = [
  {
    clerkId: "seed_host_arjun",
    fullName: "Arjun Sharma",
    email: "arjun.sharma@demo.matchpit.in",
    phone: "9829011001",
    favoriteSports: ["football", "cricket"],
    primarySkillLevel: "intermediate",
    walletBalance: "500",
    onboardingComplete: true,
  },
  {
    clerkId: "seed_host_priya",
    fullName: "Priya Gupta",
    email: "priya.gupta@demo.matchpit.in",
    phone: "9829011002",
    favoriteSports: ["badminton"],
    primarySkillLevel: "advanced",
    walletBalance: "250",
    onboardingComplete: true,
  },
  {
    clerkId: "seed_host_vikram",
    fullName: "Vikram Singh",
    email: "vikram.singh@demo.matchpit.in",
    phone: "9829011003",
    favoriteSports: ["cricket", "box_cricket"],
    primarySkillLevel: "intermediate",
    walletBalance: "100",
    onboardingComplete: true,
  },
  {
    clerkId: "seed_player_rohit",
    fullName: "Rohit Verma",
    email: "rohit.verma@demo.matchpit.in",
    phone: "9829011004",
    favoriteSports: ["football"],
    primarySkillLevel: "beginner",
    walletBalance: "50",
    onboardingComplete: true,
  },
  {
    clerkId: "seed_player_sneha",
    fullName: "Sneha Joshi",
    email: "sneha.joshi@demo.matchpit.in",
    phone: "9829011005",
    favoriteSports: ["badminton", "pickleball"],
    primarySkillLevel: "intermediate",
    walletBalance: "75",
    onboardingComplete: true,
  },
  {
    clerkId: "seed_player_amit",
    fullName: "Amit Kumar",
    email: "amit.kumar@demo.matchpit.in",
    phone: "9829011006",
    favoriteSports: ["cricket"],
    primarySkillLevel: "advanced",
    walletBalance: "0",
    onboardingComplete: true,
  },
];

const REFERRAL_CONFIG = [
  { key: "signup_bonus", value: "50", description: "Wallet credit on new signup (₹)" },
  { key: "referral_referrer", value: "100", description: "Reward for referrer (₹)" },
  { key: "referral_referee", value: "50", description: "Welcome reward for referred user (₹)" },
  { key: "first_booking_cashback", value: "75", description: "First booking cashback (₹)" },
  { key: "first_match_cashback", value: "50", description: "First hosted match cashback (₹)" },
];

const SAMPLE_LEADS = [
  {
    venueName: "Pink City Sports Club",
    ownerName: "Rajesh Kumar Sharma",
    phone: "9829012345",
    city: "Jaipur",
    sports: ["cricket", "football"],
    message: "We have 2 turfs and want to list on MATCHPIT.",
    status: "contacted" as const,
  },
  {
    venueName: "Amer Road Turf House",
    ownerName: "Vikram Singh Rathore",
    phone: "9829023456",
    city: "Jaipur",
    sports: ["football"],
    message: "Interested in listing my 5-a-side ground.",
    status: "new" as const,
  },
];

const SLOT_TIMES = [
  { start: "06:00", end: "07:00" },
  { start: "07:00", end: "08:00" },
  { start: "17:00", end: "18:00" },
  { start: "18:00", end: "19:00" },
  { start: "19:00", end: "20:00" },
  { start: "20:00", end: "21:00" },
];

const MATCH_TEMPLATES = [
  { sport: "football", skillLevel: "intermediate" as const, totalPlayers: 10, currentPlayers: 7 },
  { sport: "cricket", skillLevel: "any" as const, totalPlayers: 12, currentPlayers: 8 },
  { sport: "badminton", skillLevel: "beginner" as const, totalPlayers: 4, currentPlayers: 2 },
  { sport: "football", skillLevel: "advanced" as const, totalPlayers: 10, currentPlayers: 9 },
  { sport: "box_cricket", skillLevel: "intermediate" as const, totalPlayers: 8, currentPlayers: 5 },
  { sport: "pickleball", skillLevel: "beginner" as const, totalPlayers: 4, currentPlayers: 3 },
  { sport: "football", skillLevel: "any" as const, totalPlayers: 14, currentPlayers: 6 },
  { sport: "cricket", skillLevel: "intermediate" as const, totalPlayers: 10, currentPlayers: 4 },
];

function referralCodeFromName(name: string): string {
  const prefix = name.split(" ")[0]!.toUpperCase().slice(0, 4);
  return `${prefix}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function seedCities() {
  for (const city of CITY_MASTER) {
    await db
      .insert(citiesTable)
      .values(city)
      .onConflictDoUpdate({
        target: citiesTable.slug,
        set: { isActive: city.isActive, launchPriority: city.launchPriority },
      });
  }
  const allCities = await db.select().from(citiesTable);
  console.log(`   ✓ ${allCities.length} cities`);
  return allCities.find((c) => c.slug === "jaipur");
}

async function seedReferralConfig() {
  for (const cfg of REFERRAL_CONFIG) {
    await db.insert(referralConfigTable).values(cfg).onConflictDoNothing();
  }
  console.log(`   ✓ ${REFERRAL_CONFIG.length} referral config rows`);
}

async function seedProfiles() {
  const inserted = [];
  for (const p of DEMO_PROFILES) {
    const [row] = await db
      .insert(profilesTable)
      .values({
        clerkId: p.clerkId,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        city: "Jaipur",
        favoriteSports: p.favoriteSports,
        primarySkillLevel: p.primarySkillLevel,
        walletBalance: p.walletBalance,
        onboardingComplete: p.onboardingComplete,
        referralCode: referralCodeFromName(p.fullName),
      })
      .returning();
    if (row) inserted.push(row);
  }
  console.log(`   ✓ ${inserted.length} demo profiles`);
  return inserted;
}

async function seedVenues(jaipurCityId: string | undefined) {
  const inserted = [];
  for (const v of JAIPUR_VENUES) {
    const [row] = await db
      .insert(venuesTable)
      .values({
        ...v,
        city: "Jaipur",
        cityId: jaipurCityId ?? null,
      })
      .returning();
    if (row) inserted.push(row);
  }
  console.log(`   ✓ ${inserted.length} venues`);
  return inserted;
}

async function seedSlots(venueCount: number) {
  const allVenues = await db.select().from(venuesTable);
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  let count = 0;

  for (const venue of allVenues) {
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = format(addDays(today, dayOffset), "yyyy-MM-dd");
      for (const time of SLOT_TIMES) {
        await db.insert(slotsTable).values({
          venueId: venue.id,
          date,
          startTime: time.start,
          endTime: time.end,
          status: "available",
          sport: venue.sports[0] ?? "football",
        });
        count++;
      }
    }
  }
  console.log(`   ✓ ${count} slots across ${venueCount} venues`);
}

async function seedHostedMatches(hosts: { id: string }[], players: { id: string }[]) {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const slotRows = await db
    .select({
      slot: slotsTable,
      venue: venuesTable,
    })
    .from(slotsTable)
    .innerJoin(venuesTable, eq(slotsTable.venueId, venuesTable.id))
    .where(
      and(
        eq(slotsTable.status, "available"),
        gte(slotsTable.date, todayStr),
        sql`${slotsTable.startTime} >= '17:00'`,
      ),
    )
    .limit(MATCH_TEMPLATES.length);

  if (!slotRows.length) {
    console.log("   ⚠ No evening slots found — skipping hosted matches");
    return;
  }

  let created = 0;
  for (let i = 0; i < slotRows.length; i++) {
    const { slot, venue } = slotRows[i]!;
    const template = MATCH_TEMPLATES[i] ?? MATCH_TEMPLATES[0]!;
    const host = hosts[i % hosts.length]!;
    const sport =
      venue.sports.includes(template.sport) ? template.sport : (venue.sports[0] ?? "football");
    const minPlayers = Math.max(2, Math.floor(template.totalPlayers * 0.6));

    const [match] = await db
      .insert(hostedMatchesTable)
      .values({
        hostUserId: host.id,
        venueId: venue.id,
        slotId: slot.id,
        sport,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        totalPlayers: template.totalPlayers,
        minPlayers,
        currentPlayers: template.currentPlayers,
        skillLevel: template.skillLevel,
        reserveFee: "99",
        finalFeePerPlayer: "350",
        totalVenueCost: 2000,
        status: "open",
        notes: `Open ${sport} match in ${venue.name} — join via Matchpit!`,
      })
      .returning();

    if (!match) continue;

    const joiners = players
      .filter((p) => p.id !== host.id)
      .slice(0, Math.min(template.currentPlayers, 4));

    for (const player of joiners) {
      await db.insert(hostedMatchParticipantsTable).values({
        matchId: match.id,
        userId: player.id,
        status: "reserved",
      });
    }

    created++;
  }
  console.log(`   ✓ ${created} open hosted matches`);
}

async function seedOwnerLeads() {
  for (const lead of SAMPLE_LEADS) {
    await db.insert(ownerLeadsTable).values(lead);
  }
  console.log(`   ✓ ${SAMPLE_LEADS.length} owner leads`);
}

async function main() {
  console.log("🌱  MATCHPIT seed starting...\n");

  console.log("📍 Cities...");
  const jaipur = await seedCities();

  console.log("⚙️  Referral config...");
  await seedReferralConfig();

  console.log("👤 Demo profiles...");
  const profiles = await seedProfiles();
  const hosts = profiles.slice(0, 3);
  const players = profiles.slice(3);

  console.log("🏟️  Venues...");
  await seedVenues(jaipur?.id);

  console.log("📅 Slots...");
  await seedSlots(JAIPUR_VENUES.length);

  console.log("⚽ Hosted matches...");
  await seedHostedMatches(hosts, players);

  console.log("📋 Owner leads...");
  await seedOwnerLeads();

  console.log("\n✅  Seed complete!");
  await closePool();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await closePool();
  process.exit(1);
});
