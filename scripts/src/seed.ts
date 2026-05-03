import {
  db,
  venuesTable,
  slotsTable,
  citiesTable,
  ownerLeadsTable,
} from "@workspace/db";
import { addDays, format } from "date-fns";

const JAIPUR_VENUES = [
  {
    name: "Malviya Nagar Turf Zone",
    address: "B-42, Malviya Nagar, Jaipur",
    sports: ["football", "cricket", "badminton"],
    pricePerHour: "900",
    openTime: "06:00",
    closeTime: "23:00",
    amenities: ["Floodlights", "Changing Rooms", "Parking", "Water"],
    description: "Premium multi-sport turf in the heart of Malviya Nagar with professional-grade synthetic grass.",
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
    openTime: "05:30",
    closeTime: "22:00",
    amenities: ["Floodlights", "Parking", "Cafeteria"],
    description: "Spacious sports complex with dedicated pickleball courts — the first of its kind in Jaipur.",
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
    openTime: "06:00",
    closeTime: "23:00",
    amenities: ["Floodlights", "Practice Nets", "Changing Rooms", "Parking"],
    description: "Full-size cricket ground and dedicated box cricket cages. Ideal for serious batsmen.",
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
    openTime: "06:00",
    closeTime: "22:30",
    amenities: ["Floodlights", "Parking", "Water"],
    description: "FIFA-grade synthetic turf perfect for 5-a-side and 7-a-side football matches.",
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
    openTime: "06:00",
    closeTime: "22:00",
    amenities: ["Air Conditioning", "Changing Rooms", "Coaching Available"],
    description: "Professional indoor badminton facility with 6 courts and certified coaches.",
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
    openTime: "05:00",
    closeTime: "23:30",
    amenities: ["Floodlights", "Parking", "Cafeteria", "Changing Rooms", "CCTV"],
    description: "Jaipur's biggest multi-sport complex. Three simultaneous games possible.",
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
    openTime: "06:00",
    closeTime: "22:00",
    amenities: ["Floodlights", "Parking", "Water"],
    description: "Well-maintained turf arena with wide open space — great for full-squad matches.",
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
    openTime: "06:00",
    closeTime: "21:00",
    amenities: ["Air Conditioning", "Equipment Rental", "Coaching"],
    description: "Jaipur's first dedicated pickleball facility — courts built to international standards.",
    rating: "4.8",
    totalReviews: 29,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Vaishali Box Cricket Hub",
    address: "8, VT Road, Vaishali Nagar, Jaipur",
    sports: ["box_cricket", "cricket"],
    pricePerHour: "850",
    openTime: "07:00",
    closeTime: "22:00",
    amenities: ["Floodlights", "Scoreboard", "Changing Rooms", "Parking"],
    description: "4 premium box cricket cages with electronic scoreboards. Book by the over or by the hour.",
    rating: "4.6",
    totalReviews: 57,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Mansarovar Football Club",
    address: "Sector 8, Mansarovar, Jaipur",
    sports: ["football"],
    pricePerHour: "800",
    openTime: "05:30",
    closeTime: "22:30",
    amenities: ["Floodlights", "Parking", "First Aid Kit"],
    description: "Dedicated 7-a-side and 11-a-side football ground with high-quality turf.",
    rating: "4.5",
    totalReviews: 76,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Jagatpura Badminton Academy",
    address: "Plot 54, New Sanganer Road, Jagatpura, Jaipur",
    sports: ["badminton"],
    pricePerHour: "550",
    openTime: "06:00",
    closeTime: "21:00",
    amenities: ["Air Conditioning", "Coaching", "Equipment Rental", "Changing Rooms"],
    description: "State-certified badminton academy open to casual players and competitive trainees.",
    rating: "4.7",
    totalReviews: 88,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "C-Scheme Cricket Ground",
    address: "Near Albert Hall, C-Scheme, Jaipur",
    sports: ["cricket", "box_cricket"],
    pricePerHour: "1100",
    openTime: "06:00",
    closeTime: "23:00",
    amenities: ["Floodlights", "Nets", "Pavilion", "Parking"],
    description: "Heritage-area cricket ground with lush outfield and dedicated box cricket nets.",
    rating: "4.6",
    totalReviews: 112,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Raja Park Football Arena",
    address: "2nd Cross Road, Raja Park, Jaipur",
    sports: ["football", "pickleball"],
    pricePerHour: "900",
    openTime: "06:00",
    closeTime: "23:00",
    amenities: ["Floodlights", "Parking", "CCTV", "Cafeteria"],
    description: "Premium 5-a-side football arena with adjacent pickleball court.",
    rating: "4.5",
    totalReviews: 63,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Tonk Road Sports Hub",
    address: "Near Gandhi Nagar, Tonk Road, Jaipur",
    sports: ["football", "badminton", "cricket"],
    pricePerHour: "950",
    openTime: "06:00",
    closeTime: "22:00",
    amenities: ["Floodlights", "Changing Rooms", "Parking", "Water", "Cafeteria"],
    description: "All-in-one sports hub on Tonk Road — football, badminton hall, and cricket practice nets.",
    rating: "4.6",
    totalReviews: 48,
    isFeatured: false,
    isApproved: true,
  },
  {
    name: "Sitapura Sports Complex",
    address: "RIICO Industrial Area, Sitapura, Jaipur",
    sports: ["cricket", "football"],
    pricePerHour: "700",
    openTime: "06:00",
    closeTime: "22:00",
    amenities: ["Floodlights", "Parking", "Changing Rooms"],
    description: "Large open complex near Sitapura with maintained turf and friendly pricing.",
    rating: "4.3",
    totalReviews: 35,
    isFeatured: false,
    isApproved: true,
  },
];

const CITY_MASTER = [
  { cityName: "Jaipur",   slug: "jaipur",   isActive: true,  launchPriority: 1 },
  { cityName: "Delhi",    slug: "delhi",    isActive: false, launchPriority: 2 },
  { cityName: "Gurgaon",  slug: "gurgaon",  isActive: false, launchPriority: 3 },
  { cityName: "Noida",    slug: "noida",    isActive: false, launchPriority: 4 },
  { cityName: "Mumbai",   slug: "mumbai",   isActive: false, launchPriority: 5 },
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
  {
    venueName: "Bani Park Sports Zone",
    ownerName: "Anita Gupta",
    phone: "9829034567",
    city: "Jaipur",
    sports: ["badminton", "pickleball"],
    message: "4-court badminton complex, want to onboard ASAP.",
    status: "demo" as const,
  },
];

const SLOT_TIMES = [
  { start: "06:00", end: "07:00" },
  { start: "07:00", end: "08:00" },
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "16:00", end: "17:00" },
  { start: "17:00", end: "18:00" },
  { start: "18:00", end: "19:00" },
  { start: "19:00", end: "20:00" },
  { start: "20:00", end: "21:00" },
  { start: "21:00", end: "22:00" },
];

async function main() {
  console.log("🌱  MATCHPIT seed starting...\n");

  // ── City Master ────────────────────────────────────────────
  console.log("📍 Seeding city master...");
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
  const jaipurRecord = allCities.find((c) => c.slug === "jaipur");
  console.log(`   ✓ ${allCities.length} cities seeded`);

  // ── Venues ────────────────────────────────────────────────
  console.log("🏟️  Seeding 15 Jaipur venues...");
  const insertedVenues = [];
  for (const v of JAIPUR_VENUES) {
    const [inserted] = await db
      .insert(venuesTable)
      .values({
        ...v,
        city: "Jaipur",
        cityId: jaipurRecord?.id ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) insertedVenues.push(inserted);
  }
  console.log(`   ✓ ${insertedVenues.length} new venues inserted`);

  // ── Slots ─────────────────────────────────────────────────
  const allVenues = await db.select().from(venuesTable);
  const today = new Date();
  let slotCount = 0;

  console.log("📅 Seeding slots for 14 days...");
  for (const venue of allVenues) {
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = format(addDays(today, dayOffset), "yyyy-MM-dd");
      for (const time of SLOT_TIMES) {
        await db
          .insert(slotsTable)
          .values({
            venueId: venue.id,
            date,
            startTime: time.start,
            endTime: time.end,
            status: "available",
          })
          .onConflictDoNothing();
        slotCount++;
      }
    }
  }
  console.log(`   ✓ Processed ${slotCount} slots across ${allVenues.length} venues`);

  // ── Owner Leads ───────────────────────────────────────────
  console.log("📋 Seeding sample owner leads...");
  for (const lead of SAMPLE_LEADS) {
    await db.insert(ownerLeadsTable).values(lead).onConflictDoNothing();
  }
  console.log(`   ✓ ${SAMPLE_LEADS.length} sample leads seeded`);

  console.log("\n✅  Seed complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
