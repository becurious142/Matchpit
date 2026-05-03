import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  venuesTable,
  profilesTable,
  paymentsTable,
  slotsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, ne, count } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";

const router: IRouter = Router();

function formatProfile(p: typeof profilesTable.$inferSelect) {
  return {
    id: p.id,
    clerkId: p.clerkId,
    fullName: p.fullName,
    email: p.email,
    phone: p.phone ?? null,
    city: p.city ?? null,
    favoriteSports: p.favoriteSports ?? [],
    avatarUrl: p.avatarUrl ?? null,
    walletBalance: Number(p.walletBalance),
    badgeCount: p.badgeCount,
    trustScore: Number(p.trustScore),
    isAdmin: p.isAdmin,
    createdAt: p.createdAt.toISOString(),
  };
}

function formatVenue(v: typeof venuesTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    city: v.city,
    address: v.address,
    sports: v.sports ?? [],
    pricePerHour: Number(v.pricePerHour),
    coverImage: v.coverImage ?? null,
    rating: Number(v.rating),
    totalReviews: v.totalReviews,
    isApproved: v.isApproved,
    amenities: v.amenities ?? [],
  };
}

function formatMatch(
  m: typeof hostedMatchesTable.$inferSelect,
  venue?: typeof venuesTable.$inferSelect | null,
  host?: typeof profilesTable.$inferSelect | null,
) {
  return {
    id: m.id,
    hostUserId: m.hostUserId,
    venueId: m.venueId,
    slotId: m.slotId,
    sport: m.sport,
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    totalPlayers: m.totalPlayers,
    minPlayers: m.minPlayers,
    currentPlayers: m.currentPlayers,
    skillLevel: m.skillLevel,
    hostFee: Number(m.hostFee),
    reserveFee: Number(m.reserveFee),
    finalFeePerPlayer: Number(m.finalFeePerPlayer),
    totalVenueCost: Number(m.totalVenueCost),
    notes: m.notes ?? null,
    status: m.status,
    financialStatus: m.financialStatus,
    createdAt: m.createdAt.toISOString(),
    venue: venue ? formatVenue(venue) : null,
    host: host ? formatProfile(host) : null,
  };
}

function formatParticipant(
  p: typeof hostedMatchParticipantsTable.$inferSelect,
  user?: typeof profilesTable.$inferSelect | null,
  match?: ReturnType<typeof formatMatch> | null,
) {
  return {
    id: p.id,
    matchId: p.matchId,
    userId: p.userId,
    status: p.status,
    reservePaymentId: p.reservePaymentId ?? null,
    finalPaymentId: p.finalPaymentId ?? null,
    joinedAt: p.joinedAt.toISOString(),
    user: user ? formatProfile(user) : null,
    match: match ?? null,
  };
}

// GET /hosted-matches
router.get("/hosted-matches", async (req, res) => {
  try {
    const {
      sport,
      city,
      skillLevel,
      status,
      page = "1",
      limit = "12",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let matches = await db
      .select()
      .from(hostedMatchesTable)
      .orderBy(desc(hostedMatchesTable.createdAt));

    // Filter in memory for array fields
    if (sport) matches = matches.filter((m) => m.sport === sport);
    if (skillLevel) matches = matches.filter((m) => m.skillLevel === skillLevel);
    if (status) matches = matches.filter((m) => m.status === status);

    const total = matches.length;
    const paged = matches.slice(offset, offset + limitNum);

    const venueIds = [...new Set(paged.map((m) => m.venueId))];
    const hostIds = [...new Set(paged.map((m) => m.hostUserId))];

    const venues =
      venueIds.length > 0
        ? await db.select().from(venuesTable)
        : [];
    const hosts =
      hostIds.length > 0
        ? await db.select().from(profilesTable)
        : [];

    const venueMap = new Map(venues.map((v) => [v.id, v]));
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    // Filter by city if provided (via venue)
    let result = paged.map((m) =>
      formatMatch(m, venueMap.get(m.venueId) ?? null, hostMap.get(m.hostUserId) ?? null),
    );
    if (city) result = result.filter((m) => m.venue?.city === city);

    res.json({
      matches: result,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    req.log.error({ err }, "Error listing hosted matches");
    res.status(500).json({ error: "internal_error", message: "Failed to list matches" });
  }
});

// POST /hosted-matches
router.post("/hosted-matches", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const {
      venueId,
      slotId,
      sport,
      totalPlayers,
      minPlayers,
      skillLevel,
      notes,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    // Verify payment signature
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid && process.env.RAZORPAY_KEY_SECRET) {
      res.status(400).json({ error: "invalid_signature", message: "Payment verification failed" });
      return;
    }

    // Get slot and venue
    const [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
    if (!slot) {
      res.status(404).json({ error: "not_found", message: "Slot not found" });
      return;
    }

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    // Commerce math
    const totalVenueCost = Number(venue.pricePerHour);
    const reserveFee = Math.ceil(totalVenueCost / totalPlayers / 2);
    const finalFeePerPlayer = Math.ceil(totalVenueCost / totalPlayers);
    const hostFee = 99;

    // Record host payment
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        userId: profile.id,
        type: "host_commitment",
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        amount: hostFee.toString(),
        status: "success",
      })
      .returning();

    // Mark slot as held
    await db
      .update(slotsTable)
      .set({ status: "held", updatedAt: new Date() })
      .where(eq(slotsTable.id, slotId));

    // Create hosted match
    const [match] = await db
      .insert(hostedMatchesTable)
      .values({
        hostUserId: profile.id,
        venueId,
        slotId,
        sport,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        totalPlayers,
        minPlayers,
        skillLevel: skillLevel ?? "any",
        reserveFee: reserveFee.toString(),
        finalFeePerPlayer: finalFeePerPlayer.toString(),
        totalVenueCost: totalVenueCost.toString(),
        notes: notes ?? null,
        status: "open",
        hostPaymentId: payment.id,
      })
      .returning();

    // Update payment reference
    await db
      .update(paymentsTable)
      .set({ referenceId: match.id })
      .where(eq(paymentsTable.id, payment.id));

    res.status(201).json(formatMatch(match, venue, profile));
  } catch (err) {
    req.log.error({ err }, "Error creating hosted match");
    res.status(500).json({ error: "internal_error", message: "Failed to create hosted match" });
  }
});

// GET /hosted-matches/my
router.get("/hosted-matches/my", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.hostUserId, profile.id))
      .orderBy(desc(hostedMatchesTable.createdAt));

    const venues = await db.select().from(venuesTable);
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    res.json(matches.map((m) => formatMatch(m, venueMap.get(m.venueId) ?? null, profile)));
  } catch (err) {
    req.log.error({ err }, "Error listing my hosted matches");
    res.status(500).json({ error: "internal_error", message: "Failed to list matches" });
  }
});

// GET /hosted-matches/joined
router.get("/hosted-matches/joined", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.userId, profile.id))
      .orderBy(desc(hostedMatchParticipantsTable.joinedAt));

    const matchIds = [...new Set(participants.map((p) => p.matchId))];
    const matches = matchIds.length > 0 ? await db.select().from(hostedMatchesTable) : [];
    const venues = await db.select().from(venuesTable);
    const hosts = await db.select().from(profilesTable);

    const matchMap = new Map(matches.map((m) => [m.id, m]));
    const venueMap = new Map(venues.map((v) => [v.id, v]));
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    res.json(
      participants.map((p) => {
        const match = matchMap.get(p.matchId);
        const venue = match ? venueMap.get(match.venueId) : null;
        const host = match ? hostMap.get(match.hostUserId) : null;
        return formatParticipant(
          p,
          profile,
          match ? formatMatch(match, venue ?? null, host ?? null) : null,
        );
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing joined matches");
    res.status(500).json({ error: "internal_error", message: "Failed to list joined matches" });
  }
});

// GET /hosted-matches/:matchId
router.get("/hosted-matches/:matchId", async (req, res) => {
  try {
    const matchId = req.params.matchId as string;
    const { userId } = getAuth(req);
    const profile = userId ? await getProfileByClerkId(userId) : null;

    const [match] = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .limit(1);

    if (!match) {
      res.status(404).json({ error: "not_found", message: "Match not found" });
      return;
    }

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, match.venueId)).limit(1);
    const [host] = await db.select().from(profilesTable).where(eq(profilesTable.id, match.hostUserId)).limit(1);

    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          ne(hostedMatchParticipantsTable.status, "cancelled"),
        ),
      );

    const userIds = participants.map((p) => p.userId);
    const users = userIds.length > 0 ? await db.select().from(profilesTable) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const spotsLeft = match.totalPlayers - match.currentPlayers;
    const isUserJoined = profile
      ? participants.some((p) => p.userId === profile.id)
      : false;

    res.json({
      ...formatMatch(match, venue ?? null, host ?? null),
      participants: participants.map((p) =>
        formatParticipant(p, userMap.get(p.userId) ?? null, null),
      ),
      spotsLeft,
      isUserJoined,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching hosted match");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch match" });
  }
});

// POST /hosted-matches/:matchId/join
router.post("/hosted-matches/:matchId/join", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const matchId = req.params.matchId as string;
    const [match] = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .limit(1);

    if (!match) {
      res.status(404).json({ error: "not_found", message: "Match not found" });
      return;
    }

    if (match.status !== "open") {
      res.status(409).json({ error: "match_not_open", message: "Match is not open for joining" });
      return;
    }

    if (match.currentPlayers >= match.totalPlayers) {
      res.status(409).json({ error: "match_full", message: "Match is full" });
      return;
    }

    // Check already joined
    const existing = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          eq(hostedMatchParticipantsTable.userId, profile.id),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "already_joined", message: "You have already joined this match" });
      return;
    }

    // Create participant record
    const [participant] = await db
      .insert(hostedMatchParticipantsTable)
      .values({
        matchId,
        userId: profile.id,
        status: "reserved",
      })
      .returning();

    // Increment player count
    const newCount = match.currentPlayers + 1;
    await db
      .update(hostedMatchesTable)
      .set({
        currentPlayers: newCount,
        status: newCount >= match.minPlayers ? "confirmed" : "open",
        updatedAt: new Date(),
      })
      .where(eq(hostedMatchesTable.id, matchId));

    // Notifications
    await db.insert(notificationsTable).values({
      userId: profile.id,
      type: "match_joined",
      title: "You joined a match!",
      body: `You reserved a spot in the ${match.sport} match on ${match.date}.`,
      referenceId: matchId,
    });

    if (newCount >= match.minPlayers) {
      await db.insert(notificationsTable).values({
        userId: match.hostUserId,
        type: "match_confirmed",
        title: "Match Confirmed!",
        body: `Your ${match.sport} match on ${match.date} has enough players and is now confirmed!`,
        referenceId: matchId,
      });
    }

    res.status(201).json(formatParticipant(participant, profile, null));
  } catch (err) {
    req.log.error({ err }, "Error joining match");
    res.status(500).json({ error: "internal_error", message: "Failed to join match" });
  }
});

// GET /hosted-matches/:matchId/participants
router.get("/hosted-matches/:matchId/participants", async (req, res) => {
  try {
    const matchId = req.params.matchId as string;
    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, matchId));

    const userIds = participants.map((p) => p.userId);
    const users = userIds.length > 0 ? await db.select().from(profilesTable) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    res.json(
      participants.map((p) => formatParticipant(p, userMap.get(p.userId) ?? null, null)),
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching participants");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch participants" });
  }
});

// POST /hosted-matches/:matchId/final-payment
router.post("/hosted-matches/:matchId/final-payment", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const matchId = req.params.matchId as string;
    const [match] = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .limit(1);

    if (!match) {
      res.status(404).json({ error: "not_found", message: "Match not found" });
      return;
    }

    if (match.status !== "confirmed" && match.status !== "funded") {
      res.status(400).json({ error: "invalid_state", message: "Match is not in a confirmed state" });
      return;
    }

    // Verify caller is a registered participant with "reserved" status
    const [participant] = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          eq(hostedMatchParticipantsTable.userId, profile.id),
        ),
      )
      .limit(1);

    if (!participant) {
      res.status(403).json({ error: "not_participant", message: "You are not a participant of this match" });
      return;
    }

    if (participant.status === "final_paid") {
      res.status(400).json({ error: "already_paid", message: "Final payment already completed" });
      return;
    }

    if (participant.status === "cancelled") {
      res.status(400).json({ error: "cancelled", message: "Your participation has been cancelled" });
      return;
    }

    const finalFee = Number(match.finalFeePerPlayer);
    const amountPaise = Math.round(finalFee * 100);

    if (!razorpay) {
      // Dev mode: return mock order when no Razorpay keys configured
      res.json({
        orderId: `order_dev_final_${Date.now()}`,
        amount: amountPaise,
        currency: "INR",
        razorpayKeyId: "rzp_test_placeholder",
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      notes: {
        type: "match_final",
        referenceId: matchId,
        participantId: participant.id,
        userId: profile.id,
      },
    });

    // Record pending payment
    await db.insert(paymentsTable).values({
      userId: profile.id,
      type: "match_final",
      referenceId: matchId,
      razorpayOrderId: order.id,
      amount: finalFee.toString(),
      status: "pending",
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: getRazorpayKeyId(),
      prefillName: profile.fullName,
      prefillEmail: profile.email,
      prefillContact: profile.phone ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating final payment order");
    res.status(500).json({ error: "internal_error", message: "Failed to initiate final payment" });
  }
});

export default router;
