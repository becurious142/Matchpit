import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  profilesTable,
  communityPostsTable,
  squadsTable,
  squadMembersTable,
  squadChallengesTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  notificationsTable,
  citiesTable,
  venuesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// ─── Indian names pool ────────────────────────────────────────────────────────
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

const AREAS = [
  "Mansarovar","Vaishali Nagar","Malviya Nagar","Jagatpura","Raja Park",
  "Tonk Road","Nirman Nagar","C-Scheme","Sitapura","Sanganer",
  "Murlipura","Vidyadhar Nagar","Bajaj Nagar","Shyam Nagar","Jhotwara",
];

const SPORTS = ["cricket","football","badminton","box-cricket","pickleball"];

const SKILL_LEVELS = ["beginner","intermediate","advanced"];

const POST_TYPES = ["text","looking_players","match_result","challenge","venue_review","achievement"];

const POST_CAPTIONS = [
  "Looking for 3 more players for tomorrow's box-cricket at Mansarovar. DM!",
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
  "Box-cricket tournament next month — forming team now",
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

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateReferralCode(name: string): string {
  const prefix = name.split(" ")[0]!.toUpperCase().slice(0, 4);
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
}

// ─── POST /admin/seed/demo-profiles ──────────────────────────────────────────
router.post("/admin/seed/demo-profiles", requireAdmin, async (req, res) => {
  try {
    const created: string[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      const name = NAMES[i]!;
      const area = randomElement(AREAS);
      const sport = randomElement(SPORTS);
      const skill = randomElement(SKILL_LEVELS);
      const emailSlug = name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
      const clerkId = `demo_clerk_${Date.now()}_${i}`;

      const existing = await db.select({ id: profilesTable.id })
        .from(profilesTable)
        .where(sql`${profilesTable.email} = ${emailSlug + "@demo.matchpit.in"}`)
        .limit(1);

      if (existing.length > 0) continue;

      const [profile] = await db.insert(profilesTable).values({
        clerkId,
        fullName: name,
        email: `${emailSlug}@demo.matchpit.in`,
        phone: `9${randomInt(100000000, 999999999)}`,
        city: "Jaipur",
        favoriteSports: [sport, randomElement(SPORTS)].filter((v, i, a) => a.indexOf(v) === i),
        preferredAreas: [area, randomElement(AREAS)].filter((v, i, a) => a.indexOf(v) === i),
        primarySkillLevel: skill,
        walletBalance: randomInt(0, 500).toString(),
        trustScore: randomInt(60, 100).toString(),
        referralCode: generateReferralCode(name),
        onboardingComplete: true,
      }).returning();

      created.push(profile.id);
    }
    res.json({ seeded: created.length, message: `Created ${created.length} demo profiles` });
  } catch (err) {
    req.log.error({ err }, "Error seeding demo profiles");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

// ─── POST /admin/seed/demo-community ─────────────────────────────────────────
router.post("/admin/seed/demo-community", requireAdmin, async (req, res) => {
  try {
    const demoProfiles = await db.select({ id: profilesTable.id })
      .from(profilesTable)
      .where(sql`${profilesTable.email} LIKE '%@demo.matchpit.in'`)
      .limit(40);

    if (!demoProfiles.length) {
      res.status(400).json({ error: "seed_profiles_first", message: "Run demo-profiles seed first" });
      return;
    }

    const [city] = await db.select({ id: citiesTable.id }).from(citiesTable)
      .where(eq(citiesTable.isActive, true)).limit(1);

    const created: string[] = [];
    for (let i = 0; i < Math.min(30, POST_CAPTIONS.length); i++) {
      const profile = randomElement(demoProfiles);
      const [post] = await db.insert(communityPostsTable).values({
        userId: profile.id,
        cityId: city?.id ?? null,
        type: randomElement(POST_TYPES) as any,
        caption: POST_CAPTIONS[i]!,
        sport: randomElement(SPORTS),
        likesCount: randomInt(0, 25),
        commentsCount: randomInt(0, 8),
      }).returning();
      created.push(post.id);
    }
    res.json({ seeded: created.length, message: `Created ${created.length} community posts` });
  } catch (err) {
    req.log.error({ err }, "Error seeding community");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

// ─── POST /admin/seed/demo-squads ────────────────────────────────────────────
router.post("/admin/seed/demo-squads", requireAdmin, async (req, res) => {
  try {
    const demoProfiles = await db.select({ id: profilesTable.id })
      .from(profilesTable)
      .where(sql`${profilesTable.email} LIKE '%@demo.matchpit.in'`)
      .limit(40);

    if (!demoProfiles.length) {
      res.status(400).json({ error: "seed_profiles_first" });
      return;
    }

    const [city] = await db.select({ id: citiesTable.id }).from(citiesTable)
      .where(eq(citiesTable.isActive, true)).limit(1);

    const squadNames = [
      "Mansarovar Strikers","Vaishali Warriors","Raja Park Renegades",
      "Malviya FC","Jagatpura Jesters","Tonk Road Tigers",
      "C-Scheme Challengers","Sitapura Spartans","Sanganer Stallions","Jaipur Aces",
    ];

    const created: string[] = [];
    for (const sName of squadNames) {
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
        cityId: city?.id ?? null,
        wins: randomInt(0, 15),
        losses: randomInt(0, 10),
        memberCount: members.length + 1,
        trustRating: (randomInt(30, 50) / 10).toString(),
      }).returning();

      await db.insert(squadMembersTable).values({ squadId: squad.id, userId: captain.id, role: "captain" });
      for (const m of members) {
        await db.insert(squadMembersTable).values({ squadId: squad.id, userId: m.id, role: "member" });
      }
      created.push(squad.id);
    }
    res.json({ seeded: created.length, message: `Created ${created.length} squads` });
  } catch (err) {
    req.log.error({ err }, "Error seeding squads");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

// ─── POST /admin/seed/demo-hosted-matches ────────────────────────────────────
router.post("/admin/seed/demo-hosted-matches", requireAdmin, async (req, res) => {
  try {
    const demoProfiles = await db.select({ id: profilesTable.id })
      .from(profilesTable)
      .where(sql`${profilesTable.email} LIKE '%@demo.matchpit.in'`)
      .limit(40);

    const venues = await db.select({ id: venuesTable.id }).from(venuesTable)
      .where(eq(venuesTable.isApproved, true)).limit(10);

    if (!demoProfiles.length || !venues.length) {
      res.status(400).json({ error: "missing_deps", message: "Need demo profiles + approved venues" });
      return;
    }

    const statuses = ["open","open","open","confirmed","confirmed","completed","cancelled"] as const;
    const created: string[] = [];

    for (let i = 0; i < 15; i++) {
      const host = randomElement(demoProfiles);
      const venue = randomElement(venues);
      const sport = randomElement(SPORTS);
      const skill = randomElement(SKILL_LEVELS);
      const daysOffset = randomInt(-10, 20);
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() + daysOffset);
      const total = randomInt(8, 14);
      const current = randomInt(2, total);
      const status = randomElement(statuses);

      const [match] = await db.insert(hostedMatchesTable).values({
        hostUserId: host.id,
        venueId: venue.id,
        slotId: crypto.randomUUID(),
        sport,
        date: matchDate.toISOString().split("T")[0]!,
        startTime: `${randomInt(6, 20).toString().padStart(2, "0")}:00`,
        endTime: `${randomInt(7, 21).toString().padStart(2, "0")}:00`,
        skillLevel: skill as any,
        totalPlayers: total,
        minPlayers: Math.floor(total * 0.6),
        currentPlayers: current,
        reserveFee: randomInt(50, 200).toString(),
        finalFeePerPlayer: randomInt(150, 600).toString(),
        totalVenueCost: randomInt(1000, 4000).toString(),
        status: status as any,
        notes: `Demo match — ${randomElement(AREAS)} area players welcome!`,
      }).returning();

      // Add a few participants
      const participants = demoProfiles
        .filter((p) => p.id !== host.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(current, 5));

      for (const p of participants) {
        await db.insert(hostedMatchParticipantsTable).values({
          matchId: match.id,
          userId: p.id,
          status: randomElement(["reserved","final_paid"]) as any,
          reserveFeePaid: true,
        }).catch(() => {});
      }

      created.push(match.id);
    }
    res.json({ seeded: created.length, message: `Created ${created.length} hosted matches` });
  } catch (err) {
    req.log.error({ err }, "Error seeding matches");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

// ─── POST /admin/seed/demo-notifications ─────────────────────────────────────
router.post("/admin/seed/demo-notifications", requireAdmin, async (req, res) => {
  try {
    const demoProfiles = await db.select({ id: profilesTable.id })
      .from(profilesTable)
      .where(sql`${profilesTable.email} LIKE '%@demo.matchpit.in'`)
      .limit(10);

    if (!demoProfiles.length) {
      res.status(400).json({ error: "seed_profiles_first" });
      return;
    }

    const notifTemplates = [
      { type: "match_confirmed", title: "Match Confirmed!", body: "Your Saturday cricket match is confirmed. Get ready!" },
      { type: "reserve_joined", title: "Spot Reserved!", body: "You've successfully reserved your spot. Final payment due soon." },
      { type: "booking_confirmed", title: "Booking Confirmed!", body: "Mansarovar Sports Arena — Sunday 8am-10am booked!" },
      { type: "wallet_credit", title: "₹100 Added to Wallet!", body: "Referral reward credited. Use it on your next booking." },
      { type: "match_almost_full", title: "Match Almost Full!", body: "Only 2 spots left in tomorrow's football match. Invite friends!" },
      { type: "nudge_unpaid", title: "Final Payment Reminder", body: "Your match is in 2 days. Please complete final payment to secure your spot." },
      { type: "squad_challenge", title: "Squad Challenge!", body: "Vaishali Warriors have challenged your squad to a match!" },
      { type: "match_created", title: "Match Created!", body: "Your 5-a-side match is live. Share to fill spots faster." },
      { type: "referral_reward", title: "Referral Bonus!", body: "Your friend Rohit just booked their first match. ₹75 credited!" },
      { type: "trust_updated", title: "Trust Score Updated", body: "Great hosting! Your trust score is now 95. Keep it up!" },
    ];

    const created: string[] = [];
    for (const profile of demoProfiles) {
      for (let j = 0; j < 2; j++) {
        const tmpl = randomElement(notifTemplates);
        const [notif] = await db.insert(notificationsTable).values({
          userId: profile.id,
          type: tmpl.type as any,
          title: tmpl.title,
          body: tmpl.body,
          isRead: Math.random() > 0.5,
        }).returning();
        created.push(notif.id);
      }
    }
    res.json({ seeded: created.length, message: `Created ${created.length} notifications` });
  } catch (err) {
    req.log.error({ err }, "Error seeding notifications");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

// ─── POST /admin/seed/demo-challenges ────────────────────────────────────────
router.post("/admin/seed/demo-challenges", requireAdmin, async (req, res) => {
  try {
    const squads = await db.select({ id: squadsTable.id, sport: squadsTable.sport })
      .from(squadsTable).limit(10);

    if (squads.length < 2) {
      res.status(400).json({ error: "seed_squads_first" });
      return;
    }

    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const shuffled = squads.sort(() => Math.random() - 0.5);
      const challenger = shuffled[0]!;
      const opponent = shuffled.find((s) => s.id !== challenger.id)!;
      if (!opponent) continue;

      const challengeDate = new Date();
      challengeDate.setDate(challengeDate.getDate() + randomInt(3, 14));

      const [challenge] = await db.insert(squadChallengesTable).values({
        challengerSquadId: challenger.id,
        opponentSquadId: opponent.id,
        sport: challenger.sport,
        proposedDate: challengeDate.toISOString().split("T")[0]!,
        status: randomElement(["pending","accepted","pending"]) as any,
        message: `We challenge you to a ${challenger.sport} match! Let's settle this on the pitch.`,
      }).returning();
      created.push(challenge.id);
    }
    res.json({ seeded: created.length, message: `Created ${created.length} squad challenges` });
  } catch (err) {
    req.log.error({ err }, "Error seeding challenges");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

// ─── POST /admin/seed/all — One-click full demo ecosystem ────────────────────
router.post("/admin/seed/all", requireAdmin, async (req, res) => {
  try {
    const base = "http://localhost:8080";
    const headers = { "Content-Type": "application/json", ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) };

    const results: Record<string, unknown> = {};

    const profileRes = await fetch(`${base}/api/admin/seed/demo-profiles`, { method: "POST", headers });
    results.profiles = await profileRes.json();

    const communityRes = await fetch(`${base}/api/admin/seed/demo-community`, { method: "POST", headers });
    results.community = await communityRes.json();

    const squadsRes = await fetch(`${base}/api/admin/seed/demo-squads`, { method: "POST", headers });
    results.squads = await squadsRes.json();

    const matchesRes = await fetch(`${base}/api/admin/seed/demo-hosted-matches`, { method: "POST", headers });
    results.matches = await matchesRes.json();

    const notifsRes = await fetch(`${base}/api/admin/seed/demo-notifications`, { method: "POST", headers });
    results.notifications = await notifsRes.json();

    const challengesRes = await fetch(`${base}/api/admin/seed/demo-challenges`, { method: "POST", headers });
    results.challenges = await challengesRes.json();

    res.json({ ok: true, results });
  } catch (err) {
    req.log.error({ err }, "Error running full seed");
    res.status(500).json({ error: "internal_error", detail: String(err) });
  }
});

export default router;
