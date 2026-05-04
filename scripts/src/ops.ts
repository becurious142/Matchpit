/**
 * One-time operational script:
 * 1. Dedup venues (keep oldest per name+city)
 * 2. Update existing venues with cover images
 * 3. Run full demo seed
 * 4. Print final DB counts
 */
import {
  db,
  venuesTable,
  slotsTable,
  profilesTable,
  communityPostsTable,
  squadsTable,
  squadMembersTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  notificationsTable,
  citiesTable,
  squadChallengesTable,
  playerFollowsTable,
  matchMessagesTable,
} from "@workspace/db";
import { and, eq, inArray, count, sql } from "drizzle-orm";

// Sport-specific cover images
const VENUE_COVER_IMAGES: Record<string, string> = {
  "Malviya Nagar Turf Zone": "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80",
  "Vaishali Nagar Sports Hub": "https://images.unsplash.com/photo-1551958219-acbc595d9e47?w=800&q=80",
  "Mansarovar Cricket Arena": "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80",
  "Jagatpura Football Ground": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80",
  "C-Scheme Badminton Club": "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80",
  "Raja Park Sports Complex": "https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80",
  "Tonk Road Turf Arena": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80",
  "Malviya Nagar Pickleball Court": "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80",
  "Vaishali Box Cricket Hub": "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80",
  "Mansarovar Football Club": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80",
  "Jagatpura Badminton Academy": "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80",
  "C-Scheme Cricket Ground": "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80",
  "Raja Park Football Arena": "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80",
  "Tonk Road Sports Hub": "https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80",
  "Sitapura Sports Complex": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80",
};

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log("\n🔧 MATCHPIT OPERATIONAL SEQUENCE\n");

  // ── STEP 1: Dedup venues ──────────────────────────────────────────────────
  console.log("STEP 1: Deduplicating venues...");
  const allVenues = await db.select({
    id: venuesTable.id,
    name: venuesTable.name,
    cityId: venuesTable.cityId,
    createdAt: venuesTable.createdAt,
  }).from(venuesTable).orderBy(venuesTable.createdAt);

  const groups = new Map<string, { id: string; createdAt: Date }[]>();
  for (const v of allVenues) {
    const key = `${v.name}::${v.cityId ?? "null"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: v.id, createdAt: v.createdAt });
  }

  const toDelete: string[] = [];
  for (const [, rows] of groups) {
    if (rows.length <= 1) continue;
    const [, ...duplicates] = rows;
    toDelete.push(...duplicates.map((r) => r.id));
  }

  if (toDelete.length > 0) {
    // Delete orphan slots first
    for (const venueId of toDelete) {
      await db.delete(slotsTable).where(eq(slotsTable.venueId, venueId));
    }
    await db.delete(venuesTable).where(inArray(venuesTable.id, toDelete));
    console.log(`   ✓ Removed ${toDelete.length} duplicate venues`);
  } else {
    console.log("   ✓ No duplicates found");
  }

  // ── STEP 2: Update cover images on existing venues ────────────────────────
  console.log("\nSTEP 2: Updating venue cover images...");
  let imageUpdates = 0;
  for (const [name, imageUrl] of Object.entries(VENUE_COVER_IMAGES)) {
    const result = await db.update(venuesTable)
      .set({ coverImage: imageUrl, updatedAt: new Date() })
      .where(and(eq(venuesTable.name, name), eq(venuesTable.city, "Jaipur")));
    imageUpdates++;
  }
  console.log(`   ✓ Updated cover images for ${imageUpdates} venues`);

  // ── STEP 3: Seed demo profiles ────────────────────────────────────────────
  console.log("\nSTEP 3: Seeding demo profiles...");
  const NAMES = [
    "Arjun Sharma","Rohit Verma","Priya Gupta","Amit Kumar","Sneha Joshi",
    "Vikram Singh","Pooja Agarwal","Rahul Mehta","Anjali Yadav","Suresh Patil",
    "Kavita Rathi","Deepak Chouhan","Monika Bhatia","Rajesh Tandon","Sunita Saxena",
    "Manish Soni","Ritu Sharma","Ashok Prajapati","Divya Mathur","Gaurav Mittal",
    "Nisha Bhatt","Sanjay Rawat","Rekha Dixit","Aakash Jain","Pooja Nagar",
    "Vikas Choudhary","Meera Gupta","Lalit Singh","Poonam Tiwari","Dinesh Pandey",
    "Kritika Sharma","Hemant Solanki","Ankita Mishra","Sachin Agarwal","Shivani Kumari",
    "Pawan Nair","Bhavna Kapoor","Yogesh Srivastava","Tanvi Dubey","Ajay Rastogi",
  ];
  const AREAS = ["Mansarovar","Vaishali Nagar","Malviya Nagar","Jagatpura","Raja Park","Tonk Road","C-Scheme","Sitapura","Sanganer"];
  const SPORTS = ["cricket","football","badminton","box_cricket","pickleball"] as const;
  const SKILL_LEVELS = ["beginner","intermediate","advanced"] as const;

  function generateReferralCode(name: string): string {
    const prefix = name.split(" ")[0]!.toUpperCase().slice(0, 4);
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${suffix}`;
  }

  let profilesCreated = 0;
  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i]!;
    const emailSlug = name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
    const email = `${emailSlug}@demo.matchpit.in`;
    const existing = await db.select({ id: profilesTable.id }).from(profilesTable)
      .where(sql`${profilesTable.email} = ${email}`).limit(1);
    if (existing.length > 0) continue;

    await db.insert(profilesTable).values({
      clerkId: `demo_clerk_${Date.now()}_${i}`,
      fullName: name,
      email,
      phone: `9${randomInt(100000000, 999999999)}`,
      city: "Jaipur",
      favoriteSports: [randomElement(SPORTS), randomElement(SPORTS)].filter((v, i, a) => a.indexOf(v) === i),
      preferredAreas: [randomElement(AREAS), randomElement(AREAS)].filter((v, i, a) => a.indexOf(v) === i),
      primarySkillLevel: randomElement(SKILL_LEVELS),
      walletBalance: randomInt(0, 500).toString(),
      trustScore: randomInt(60, 100).toString(),
      referralCode: generateReferralCode(name),
      onboardingComplete: true,
    });
    profilesCreated++;
  }
  console.log(`   ✓ Created ${profilesCreated} demo profiles`);

  // ── STEP 4: Seed community posts ──────────────────────────────────────────
  console.log("\nSTEP 4: Seeding community posts...");
  const demoProfiles = await db.select({ id: profilesTable.id })
    .from(profilesTable)
    .where(sql`${profilesTable.email} LIKE '%@demo.matchpit.in'`)
    .limit(40) as { id: string }[];

  const [activeCity] = await db.select({ id: citiesTable.id })
    .from(citiesTable).where(eq(citiesTable.isActive, true)).limit(1) as { id: string }[];

  const POST_TYPES = ["text","looking_players","match_result","challenge","venue_review","achievement"] as const;
  const POST_CAPTIONS = [
    "Looking for 3 more players for tomorrow's box cricket at Mansarovar. DM!",
    "Just won our squad's first match! 6-1 vs Raja Park Ballers 🏆",
    "Best turf in Jaipur? Malviya Nagar Sports Arena is 🔥 — highly recommend!",
    "Any badminton players in Vaishali looking for morning doubles partner?",
    "Our squad is challenging any football team in C-Scheme area. Who's in?",
    "Incredible pickleball session yesterday — learned so much from the pros!",
    "Looking for cricket players in Jagatpura — every Sunday morning 7am",
    "First time hosting a match on MATCHPIT — super smooth experience!",
    "PSA: Tonk Road turf has new courts. Worth checking out!",
    "5-a-side football game tomorrow evening at Sanganer. 2 spots left!",
    "Just hit 100 trust score — consistency pays off 💪",
    "Anyone for early morning badminton at Nirman Nagar?",
    "Great game last night despite the heat. Mangoes after the match 😄",
    "Who's up for Saturday cricket? Need batsmen specifically.",
    "MATCHPIT made booking super easy — no more group chats for coordination!",
    "Finally found a regular squad to play with. This app is 🔥",
    "Box cricket tournament next month — forming team now",
    "Looking for advanced badminton players for competitive doubles",
    "New to Jaipur — where's the best football crowd in the city?",
    "Achievement unlocked: hosted 5 matches! 🎖️",
    "Squad Mangoes FC is open for new members — must be intermediate+",
    "Anyone else feel the Sitapura courts are underrated?",
    "Lost today but learned a lot — rematch next week!",
    "Looking for footwork coaching in Jaipur — any recommendations?",
    "Just joined my first match — great community here!",
    "Monsoon season football is the best — rain adds to the thrill!",
    "Pickleball is growing fast in Jaipur — join the movement!",
    "Looking for a dedicated cricket squad in Bajaj Nagar area",
    "Host review: super organized match, all players showed up on time!",
    "MATCHPIT wallet cashback is real — got ₹50 on my first booking!",
  ];

  let postsCreated = 0;
  if (demoProfiles.length > 0) {
    for (let i = 0; i < Math.min(30, POST_CAPTIONS.length); i++) {
      const profile = randomElement(demoProfiles);
      await db.insert(communityPostsTable).values({
        userId: profile.id,
        cityId: activeCity?.id ?? null,
        type: randomElement(POST_TYPES),
        caption: POST_CAPTIONS[i]!,
        sport: randomElement(SPORTS),
        likesCount: randomInt(0, 25),
        commentsCount: randomInt(0, 8),
      });
      postsCreated++;
    }
  }
  console.log(`   ✓ Created ${postsCreated} community posts`);

  // ── STEP 5: Seed squads ───────────────────────────────────────────────────
  console.log("\nSTEP 5: Seeding squads...");
  const squadNames = [
    "Mansarovar Strikers","Vaishali Warriors","Raja Park Renegades",
    "Malviya FC","Jagatpura Jesters","Tonk Road Tigers",
    "C-Scheme Challengers","Sitapura Spartans","Sanganer Stallions","Jaipur Aces",
  ];

  let squadsCreated = 0;
  for (const sName of squadNames) {
    const existing = await db.select({ id: squadsTable.id }).from(squadsTable)
      .where(eq(squadsTable.name, sName)).limit(1);
    if (existing.length > 0) continue;

    const captain = randomElement(demoProfiles);
    const sport = randomElement(SPORTS);
    const members = demoProfiles
      .filter((p) => p.id !== captain.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, randomInt(3, 8));

    const [squad] = await db.insert(squadsTable).values({
      name: sName,
      sport,
      captainUserId: captain.id,
      cityId: activeCity?.id ?? null,
      wins: randomInt(0, 15),
      losses: randomInt(0, 10),
      trustRating: (randomInt(30, 50) / 10).toString(),
    }).returning() as { id: string }[];

    await db.insert(squadMembersTable).values({ squadId: squad!.id, userId: captain.id, role: "captain" });
    for (const m of members as { id: string }[]) {
      await db.insert(squadMembersTable).values({ squadId: squad!.id, userId: m.id, role: "member" }).catch(() => {});
    }
    squadsCreated++;
  }
  console.log(`   ✓ Created ${squadsCreated} squads`);

  // ── STEP 6: Seed hosted matches ───────────────────────────────────────────
  console.log("\nSTEP 6: Seeding hosted matches...");
  const approvedVenues = await db.select({ id: venuesTable.id })
    .from(venuesTable).where(eq(venuesTable.isApproved, true)).limit(10) as { id: string }[];

  // Get real available slots to use as references
  const availableSlots = await db.select({ id: slotsTable.id, venueId: slotsTable.venueId, date: slotsTable.date })
    .from(slotsTable)
    .where(eq(slotsTable.status, "available"))
    .limit(100) as { id: string; venueId: string; date: string }[];

  const statuses = ["open","open","open","confirmed","confirmed","funded","cancelled"] as const;
  let matchesCreated = 0;

  if (demoProfiles.length > 0 && availableSlots.length > 0) {
    for (let i = 0; i < 8; i++) {
      const slot = randomElement(availableSlots);
      const host = randomElement(demoProfiles);
      const sport = randomElement(SPORTS);
      const total = randomInt(8, 14);
      const current = randomInt(2, Math.floor(total * 0.7));
      const status = randomElement(statuses);

      const [match] = await db.insert(hostedMatchesTable).values({
        hostUserId: host.id,
        venueId: slot.venueId,
        slotId: slot.id,
        sport,
        date: slot.date,
        startTime: `${randomInt(6, 20).toString().padStart(2, "0")}:00`,
        endTime: `${randomInt(7, 21).toString().padStart(2, "0")}:00`,
        skillLevel: randomElement(SKILL_LEVELS) as any,
        totalPlayers: total,
        minPlayers: Math.floor(total * 0.6),
        currentPlayers: current,
        reserveFee: randomInt(50, 200).toString(),
        finalFeePerPlayer: randomInt(150, 600).toString(),
        totalVenueCost: randomInt(1000, 4000).toString(),
        status: status as any,
        notes: `Demo match — ${randomElement(AREAS)} area players welcome!`,
      }).returning() as { id: string }[];

      const participants = demoProfiles
        .filter((p) => p.id !== host.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(current, 5));

      for (const p of participants as { id: string }[]) {
        await db.insert(hostedMatchParticipantsTable).values({
          matchId: match!.id,
          userId: p.id,
          status: randomElement(["reserved","final_paid"] as const) as any,
        }).catch(() => {});
      }
      matchesCreated++;
    }
  }
  console.log(`   ✓ Created ${matchesCreated} hosted matches`);

  // ── STEP 7: Seed follows ──────────────────────────────────────────────────
  console.log("\nSTEP 7: Seeding follow relations...");
  let followsCreated = 0;
  for (let i = 0; i < Math.min(20, demoProfiles.length); i++) {
    const follower = demoProfiles[i]!;
    const following = demoProfiles[(i + 1 + randomInt(0, demoProfiles.length - 2)) % demoProfiles.length]!;
    if (follower.id === following.id) continue;
    const existing = await db.select({ id: playerFollowsTable.id })
      .from(playerFollowsTable)
      .where(and(eq(playerFollowsTable.followerUserId, follower.id), eq(playerFollowsTable.followingUserId, following.id)))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(playerFollowsTable).values({ followerUserId: follower.id, followingUserId: following.id }).catch(() => {});
    followsCreated++;
  }
  console.log(`   ✓ Created ${followsCreated} follow relations`);

  // ── STEP 8: Seed chat messages ────────────────────────────────────────────
  console.log("\nSTEP 8: Seeding chat messages...");
  const openMatches = await db.select({ id: hostedMatchesTable.id })
    .from(hostedMatchesTable).where(eq(hostedMatchesTable.status, "open")).limit(5) as { id: string }[];

  const chatLines = [
    "Who's bringing the water bottles? 💧",
    "I'll be there 10 mins early to warm up",
    "Anyone need a ride from Mansarovar?",
    "Last time was epic — can't wait for this one!",
    "Wear proper studs, the turf was slippery last week",
    "Is the match still on? Weather looks iffy",
    "Confirmed! See everyone at the ground 🏟️",
    "Can we shift start time by 30 mins?",
    "I'm bringing a friend — hope that's okay",
    "GG everyone from last session! 🏆",
    "Who's the captain for today?",
    "Parking is available near the main gate",
    "Don't forget to pay your final fee before tomorrow",
    "This squad is 🔥 — best group I've played with",
    "Anyone up for a post-match chai? ☕",
    "Warm up starts at 7:30 sharp",
    "Bring your A-game today 💪",
    "Reminder: no metal studs on this turf",
    "Score update: 3-2 at half time!",
    "Amazing match everyone — same time next week?",
    "I'll be 5 mins late, please don't start without me",
    "The turf is in great condition today",
    "Who's keeping score?",
    "Let's do a quick team huddle before kickoff",
    "Great defending today Rohit! 👏",
    "Next match is already booked — check the app",
    "Anyone want to practice tomorrow morning?",
    "Venue confirmed the booking ✅",
    "Final payment reminder — 24 hours left!",
    "See you all on the pitch! 🏃",
  ];

  let chatCreated = 0;
  if (openMatches.length > 0 && demoProfiles.length > 0) {
    for (let i = 0; i < 30; i++) {
      const match = randomElement(openMatches);
      const profile = randomElement(demoProfiles);
      await db.insert(matchMessagesTable).values({
        matchId: match.id,
        userId: profile.id,
        message: chatLines[i % chatLines.length]!,
      }).catch(() => {});
      chatCreated++;
    }
  }
  console.log(`   ✓ Created ${chatCreated} chat messages`);

  // ── STEP 9: Final DB counts ───────────────────────────────────────────────
  console.log("\n" + "─".repeat(50));
  console.log("📊 FINAL DB SNAPSHOT");
  console.log("─".repeat(50));

  const [venueCount] = await db.select({ c: count() }).from(venuesTable).where(eq(venuesTable.isApproved, true));
  const [venueWithCover] = await db.select({ c: count() }).from(venuesTable)
    .where(and(eq(venuesTable.isApproved, true), sql`${venuesTable.coverImage} IS NOT NULL`));
  const [featuredCount] = await db.select({ c: count() }).from(venuesTable).where(eq(venuesTable.isFeatured, true));
  const [matchCount] = await db.select({ c: count() }).from(hostedMatchesTable);
  const [openMatchCount] = await db.select({ c: count() }).from(hostedMatchesTable).where(eq(hostedMatchesTable.status, "open"));
  const [postCount] = await db.select({ c: count() }).from(communityPostsTable);
  const [squadCount] = await db.select({ c: count() }).from(squadsTable);
  const [memberCount] = await db.select({ c: count() }).from(squadMembersTable);
  const [followCount] = await db.select({ c: count() }).from(playerFollowsTable);
  const [chatCount] = await db.select({ c: count() }).from(matchMessagesTable);
  const [profileCount] = await db.select({ c: count() }).from(profilesTable);
  const [demoProfileCount] = await db.select({ c: count() }).from(profilesTable)
    .where(sql`${profilesTable.email} LIKE '%@demo.matchpit.in'`);
  const [cityCount] = await db.select({ c: count() }).from(citiesTable).where(eq(citiesTable.isActive, true));
  const [slotCount] = await db.select({ c: count() }).from(slotsTable).where(eq(slotsTable.status, "available"));
  const [referralConfigCount] = await db.select({ c: count() }).from(
    (await import("@workspace/db")).referralConfigTable
  );

  console.log(`Cities (active):          ${cityCount.c}`);
  console.log(`Venues (approved):        ${venueCount.c}`);
  console.log(`  ↳ with cover image:     ${venueWithCover.c}`);
  console.log(`  ↳ featured:             ${featuredCount.c}`);
  console.log(`Slots (available):        ${slotCount.c}`);
  console.log(`Profiles (total):         ${profileCount.c}`);
  console.log(`  ↳ demo profiles:        ${demoProfileCount.c}`);
  console.log(`Hosted matches (total):   ${matchCount.c}`);
  console.log(`  ↳ open (joinable):      ${openMatchCount.c}`);
  console.log(`Community posts:          ${postCount.c}`);
  console.log(`Squads:                   ${squadCount.c}`);
  console.log(`Squad members:            ${memberCount.c}`);
  console.log(`Player follows:           ${followCount.c}`);
  console.log(`Chat messages:            ${chatCount.c}`);
  console.log(`Referral config rows:     ${referralConfigCount.c}`);
  console.log("─".repeat(50));
  console.log("\n✅  Operational sequence complete!");

  process.exit(0);
}

main().catch((err) => {
  console.error("Ops failed:", err);
  process.exit(1);
});
