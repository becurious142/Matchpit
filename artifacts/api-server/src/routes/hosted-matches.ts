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
import { eq, desc, and, ne, count, sql } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { razorpay, verifyRazorpaySignature, getRazorpayKeyId } from "../lib/razorpay";
import { reverseMatchPayouts } from "../lib/payouts";
import { FINAL_PAYMENT_DEADLINE_HOURS } from "../lib/post-payment";
import { idempotencyMiddleware } from "../lib/idempotency";
import { DistributedLockService, LockAcquisitionError } from "../lib/locking/distributed-lock";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

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

// POST /hosted-matches/create-order — Step 1: get a Razorpay order tied to real slot/venue
// This replaces the unsafe tempRefId pattern. The frontend calls this first,
// gets a real orderId, opens Razorpay, then calls POST /hosted-matches with the credentials.
router.post("/hosted-matches/create-order", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { venueId, slotId, totalPlayers } = req.body;
    if (!venueId || !slotId || !totalPlayers) {
      res.status(400).json({ error: "validation", message: "venueId, slotId, totalPlayers required" });
      return;
    }

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    const [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
    if (!slot) {
      res.status(404).json({ error: "not_found", message: "Slot not found" });
      return;
    }

    if (slot.status !== "available") {
      res.status(409).json({ error: "slot_unavailable", message: "This slot is no longer available" });
      return;
    }

    const hostFee = 99;
    const reserveFee = Math.ceil(Number(venue.pricePerHour) / totalPlayers / 2);
    const totalAmountToPayNow = hostFee + reserveFee;

    if (!razorpay) {
      // Dev mode — return mock order
      res.json({
        orderId: `order_dev_host_${Date.now()}`,
        amount: Math.round(totalAmountToPayNow * 100),
        currency: "INR",
        razorpayKeyId: "rzp_test_placeholder",
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
        hostFee,
        reserveFee,
        totalAmountToPayNow,
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmountToPayNow * 100),
      currency: "INR",
      notes: {
        type: "host_commitment",
        venueId,
        slotId,
        userId: profile.id,
        totalPlayers: String(totalPlayers),
      },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: getRazorpayKeyId(),
      prefillName: profile.fullName,
      prefillEmail: profile.email,
      prefillContact: profile.phone ?? null,
      hostFee,
      reserveFee,
      totalAmountToPayNow,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating host match order");
    res.status(500).json({ error: "internal_error", message: "Failed to create payment order" });
  }
});

// POST /hosted-matches
// C4: Entire payment + slot + match creation wrapped in one db.transaction.
// Any failure rolls back all three — no orphan held slots or orphan payments.
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

    // Load slot and venue before transaction to fail fast on missing data
    const [slot] = await db.select().from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
    if (!slot) {
      res.status(404).json({ error: "not_found", message: "Slot not found" });
      return;
    }
    if (slot.status !== "available") {
      res.status(409).json({ error: "slot_unavailable", message: "This slot is no longer available" });
      return;
    }

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    // Commerce math
    let computedVenueCost = Number(slot.priceOverride);
    if (!slot.priceOverride) {
      const d = new Date(slot.date);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) computedVenueCost = Number(venue.weekendPrice);
      else {
        const hour = parseInt(slot.startTime.split(":")[0]!, 10);
        if (hour < 10) computedVenueCost = Number(venue.weekdayMorningPrice);
        else if (hour < 17) computedVenueCost = Number(venue.weekdayDayPrice);
        else computedVenueCost = Number(venue.weekdayEveningPrice);
      }
    }
    const totalVenueCost = computedVenueCost || Number(venue.pricePerHour) || 0;
    const reserveFeePerPlayer = Math.ceil(totalVenueCost / totalPlayers / 2);
    const finalFeePerPlayer = Math.ceil(totalVenueCost / totalPlayers) - reserveFeePerPlayer;
    const hostFee = 49;
    const hostCommitmentGross = reserveFeePerPlayer + hostFee;

    // C4: Single transaction — payment + slot hold + match creation
    // If any step throws, the entire transaction rolls back automatically.
    const { match } = await db.transaction(async (tx) => {
      // Record host payment
      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          userId: profile.id,
          type: "host_commitment",
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amount: String(hostCommitmentGross),
          paymentCategory: "host_commitment",
          grossAmount: hostCommitmentGross,
          hostFeeComponent: hostFee,
          reserveFeeComponent: reserveFeePerPlayer,
          finalFeeComponent: 0,
          walletComponent: 0,
          refundComponent: 0,
          status: "success",
        })
        .returning();

      // Mark slot as held
      await tx
        .update(slotsTable)
        .set({ status: "held", updatedAt: new Date() })
        .where(eq(slotsTable.id, slotId));

      // Create hosted match
      const [newMatch] = await tx
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
          reserveFee: reserveFeePerPlayer.toString(),
          finalFeePerPlayer: finalFeePerPlayer.toString(),
          totalVenueCost,
          hostFee: hostFee.toString(),
          grossHostCollected: hostCommitmentGross,
          grossReserveCollected: 0,
          grossFinalCollected: 0,
          totalCollected: hostCommitmentGross,
          platformFeeTotal: hostFee,
          refundExposure: hostCommitmentGross,
          notes: notes ?? null,
          status: "open",
          hostPaymentId: payment.id,
        })
        .returning();

      // Update payment with match reference
      await tx
        .update(paymentsTable)
        .set({ referenceId: newMatch.id })
        .where(eq(paymentsTable.id, payment.id));

      return { match: newMatch };
    });

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
    if (!isValidUUID(matchId)) {
      res.status(400).json({ error: "invalid_id", message: "Invalid match ID format" });
      return;
    }
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
router.post("/hosted-matches/:matchId/join", requireAuth, idempotencyMiddleware(), async (req, res) => {
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

    const { reservePaymentId, reservePaidAmount } = req.body;
    if (!reservePaymentId || typeof reservePaidAmount !== "number") {
      res.status(400).json({ error: "validation", message: "reservePaymentId and reservePaidAmount are required" });
      return;
    }

    // Create participant record under distributed lock to prevent overfilling
    const participantResult = await DistributedLockService.withLock(`join_match:${matchId}`, async () => {
        // Re-read match inside the lock
        const [lockedMatch] = await db
          .select()
          .from(hostedMatchesTable)
          .where(eq(hostedMatchesTable.id, matchId))
          .limit(1);

        if (!lockedMatch || lockedMatch.currentPlayers >= lockedMatch.totalPlayers) {
          throw new Error("match_full");
        }

        const [participant] = await db
          .insert(hostedMatchParticipantsTable)
          .values({
            matchId,
            userId: profile.id,
            status: "reserved",
            reservePaymentId,
            finalPaymentId: null,
            reservePaidAmount,
            finalPaidAmount: 0,
            paymentStatus: "reserve_paid",
          })
          .returning();

        // Increment player count and finance
        const newCount = lockedMatch.currentPlayers + 1;
        const nowBecomesConfirmed = newCount >= lockedMatch.minPlayers && lockedMatch.status === "open";
        await db
          .update(hostedMatchesTable)
          .set({
            currentPlayers: newCount,
            status: newCount >= lockedMatch.minPlayers ? "confirmed" : lockedMatch.status,
            grossReserveCollected: sql`${hostedMatchesTable.grossReserveCollected} + ${reservePaidAmount}`,
            totalCollected: sql`${hostedMatchesTable.totalCollected} + ${reservePaidAmount}`,
            refundExposure: sql`${hostedMatchesTable.refundExposure} + ${reservePaidAmount}`,
            updatedAt: new Date(),
          })
          .where(eq(hostedMatchesTable.id, matchId));

        return { participant, newCount, nowBecomesConfirmed, lockedMatch };
      });

      const { participant, newCount, nowBecomesConfirmed, lockedMatch } = participantResult;


    // PATCH 4 — Assign finalPaymentDeadline to all reserved participants when match first becomes confirmed
    if (nowBecomesConfirmed) {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + FINAL_PAYMENT_DEADLINE_HOURS);
      await db
        .update(hostedMatchParticipantsTable)
        .set({ finalPaymentDeadline: deadline, updatedAt: new Date() })
        .where(
          and(
            eq(hostedMatchParticipantsTable.matchId, matchId),
            eq(hostedMatchParticipantsTable.paymentStatus, "reserve_paid"),
          ),
        );
    }

    // Notifications
    await db.insert(notificationsTable).values({
      userId: profile.id,
      type: "match_joined",
      title: "You joined a match!",
      body: `You reserved a spot in the ${match.sport} match on ${match.date}.`,
      referenceId: matchId,
    });

    // Almost full — notify all other participants when only 2 spots remain
    const spotsAfterJoin = match.totalPlayers - newCount;
    if (spotsAfterJoin <= 2 && spotsAfterJoin > 0) {
      const others = await db
        .select({ userId: hostedMatchParticipantsTable.userId })
        .from(hostedMatchParticipantsTable)
        .where(and(eq(hostedMatchParticipantsTable.matchId, matchId), ne(hostedMatchParticipantsTable.userId, profile.id)));
      if (others.length > 0) {
        await db.insert(notificationsTable).values(
          others.map((o) => ({
            userId: o.userId,
            type: "match_almost_full" as const,
            title: "Match Almost Full!",
            body: `Only ${spotsAfterJoin} spot${spotsAfterJoin === 1 ? "" : "s"} left in the ${match.sport} match on ${match.date}. Share before it fills up!`,
            referenceId: matchId,
          })),
        );
      }
    }

    if (newCount >= match.minPlayers) {
      await db.insert(notificationsTable).values({
        userId: match.hostUserId,
        type: "match_confirmed",
        title: "Match Confirmed!",
        body: `Your ${match.sport} match on ${match.date} has enough players and is now confirmed!`,
        referenceId: matchId,
      });
      // Notify all participants that final payment is now due
      const allParticipants = await db
        .select({ userId: hostedMatchParticipantsTable.userId })
        .from(hostedMatchParticipantsTable)
        .where(and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          ne(hostedMatchParticipantsTable.userId, match.hostUserId),
        ));
      if (allParticipants.length > 0) {
        await db.insert(notificationsTable).values(
          allParticipants.map((p) => ({
            userId: p.userId,
            type: "final_payment_due" as const,
            title: "Match Confirmed — Final Payment Due",
            body: `The ${lockedMatch.sport} match on ${lockedMatch.date} is confirmed! Complete your final payment to lock your spot.`,
            referenceId: matchId,
          })),
        );
      }
    }

    res.status(201).json(formatParticipant(participant, profile, null));
  } catch (err: any) {
    if (err instanceof LockAcquisitionError) {
      res.status(409).json({ error: "conflict", message: "Match join already in progress." });
      return;
    }
    if (err.message === "match_full") {
      res.status(409).json({ error: "match_full", message: "Match is full" });
      return;
    }
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
// C5: Before creating a new Razorpay order, check for an existing pending
// match_final payment for this user+match. If one exists, return it instead
// of creating a duplicate — prevents multiple pending orders and double payouts.
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

    // Verify caller is a registered participant
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

    // C5: Check for an existing pending order for this user+match before creating a new one
    const [existingPendingOrder] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.userId, profile.id),
          eq(paymentsTable.referenceId, matchId),
          eq(paymentsTable.type, "match_final"),
          eq(paymentsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existingPendingOrder?.razorpayOrderId) {
      // Return the existing order — client can re-open Razorpay with it
      res.json({
        orderId: existingPendingOrder.razorpayOrderId,
        amount: amountPaise,
        currency: "INR",
        razorpayKeyId: getRazorpayKeyId(),
        prefillName: profile.fullName,
        prefillEmail: profile.email,
        prefillContact: profile.phone ?? null,
        existingOrder: true,
      });
      return;
    }

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

// ─── Cancel a Match ───────────────────────────────────────────────────────────

router.post("/:matchId/cancel", requireAuth, async (req, res) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "unauthorized" }); return; }
    const profile = await getProfileByClerkId(userId);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const matchId = req.params.matchId as string;
    const { reason } = req.body as { reason?: string };

    const [match] = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, matchId))
      .limit(1);

    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }

    // Only host or admin can cancel
    if (match.hostUserId !== profile.id && !profile.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only the host or an admin can cancel this match" });
      return;
    }

    if (["cancelled", "cancelled_underfilled", "completed"].includes(match.status)) {
      res.status(400).json({ error: "invalid_state", message: `Match is already ${match.status}` });
      return;
    }

    // Fetch confirmed participants for refund
    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(
        and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          ne(hostedMatchParticipantsTable.status, "dropped_unpaid"),
        ),
      );

    // HM10 PATCH 5: Refund Atomicity
    // Entire cancellation, refund processing, and payout reversal wrapped in a single transaction
    const updated = await db.transaction(async (tx) => {
      // C1: Issue refunds using actual tracked amounts
      const cancelReason = reason ?? "Match cancelled by host";
      for (const p of participants) {
        if (["reserved", "final_paid"].includes(p.status) || ["reserve_paid", "final_paid"].includes(p.paymentStatus)) {
          try {
            const refundAmount = (p.reservePaidAmount || 0) + (p.finalPaidAmount || 0);
            if (refundAmount > 0) {
              const { processCancellationRefund } = await import("../lib/refund-routing");
              await processCancellationRefund(
                p.userId,
                p.id,
                "hosted_match",
                refundAmount,
                tx as any
              );
            }
            
            await tx
              .update(hostedMatchParticipantsTable)
              .set({ paymentStatus: "refunded", status: "cancelled", updatedAt: new Date() })
              .where(eq(hostedMatchParticipantsTable.id, p.id));
          } catch (e) {
            req.log.error({ err: e, participantId: p.id }, "Failed to refund participant on cancel — manual review required");
            // HM10: Bubble up error so tx fails atomically instead of leaving partial state
            throw e;
          }
        }
      }

      // Refund host
      if (match.grossHostCollected > 0) {
        try {
          const { processCancellationRefund } = await import("../lib/refund-routing");
          await processCancellationRefund(
            match.hostUserId,
            match.id,
            "hosted_match",
            match.grossHostCollected,
            tx as any
          );
        } catch (e) {
          req.log.error({ err: e, matchId }, "Failed to refund host on cancel — manual review required");
          throw e;
        }
      }

      // PATCH 5 — Reverse all payout ledger entries so venue is not paid for cancelled match
      await reverseMatchPayouts(matchId, tx as any);

      // Release slot
      await tx.update(slotsTable).set({ status: "available" }).where(eq(slotsTable.id, match.slotId));

      // Update match status
      await tx
        .update(hostedMatchesTable)
        .set({
          status: "cancelled",
          cancelledReason: cancelReason,
          refundExposure: 0,
          underfillRefundIssued: true,
        })
        .where(eq(hostedMatchesTable.id, matchId));

      // Notify host
      await tx.insert(notificationsTable).values({
        userId: match.hostUserId,
        type: "match_cancelled",
        title: "Match Cancelled",
        body: `Your match has been cancelled. All participants have been refunded.`,
        referenceId: matchId,
      });

      return { status: "cancelled", cancelledReason: cancelReason };
    });

    res.json({ matchId, status: updated.status, cancelledReason: updated.cancelledReason });
  } catch (err) {
    req.log.error({ err }, "Error cancelling match");
    res.status(500).json({ error: "internal_error", message: "Failed to cancel match" });
  }
});

router.post("/hosted-matches/:matchId/nudge-unpaid", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const matchId = req.params.matchId as string;
    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }
    if (match.hostUserId !== profile.id) { res.status(403).json({ error: "forbidden", message: "Not the host" }); return; }

    const reserved = await db.select({ userId: hostedMatchParticipantsTable.userId })
      .from(hostedMatchParticipantsTable)
      .where(and(eq(hostedMatchParticipantsTable.matchId, matchId), eq(hostedMatchParticipantsTable.status, "reserved")));

    if (!reserved.length) {
      res.json({ notified: 0, message: "No reserved participants to nudge" });
      return;
    }

    await db.insert(notificationsTable).values(
      reserved.map((p) => ({
        userId: p.userId,
        type: "final_payment_due" as const,
        title: "Final Payment Reminder",
        body: "Your host is reminding you to complete your payment to secure your spot in the match.",
        referenceId: matchId,
      })),
    );

    res.json({ notified: reserved.length, message: "Nudge notifications sent" });
  } catch (err) {
    req.log.error({ err }, "Error nudging unpaid participants");
    res.status(500).json({ error: "internal_error", message: "Failed to nudge participants" });
  }
});

router.get("/hosted-matches/:matchId/finance", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const matchId = req.params.matchId as string;
    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }
    if (match.hostUserId !== profile.id && !profile.isAdmin) { res.status(403).json({ error: "forbidden", message: "Access denied" }); return; }

    const payments = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.referenceId, matchId), eq(paymentsTable.status, "success")));

    const reservePayments = payments.filter((p) => p.type === "match_reserve" || p.type === "host_commitment");
    const finalPayments = payments.filter((p) => p.type === "match_final");

    const reserveCollected = reservePayments.reduce((s, p) => s + Number(p.amount), 0);
    const finalCollected = finalPayments.reduce((s, p) => s + Number(p.amount), 0);

    const participants = await db.select({ status: hostedMatchParticipantsTable.status })
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, matchId as string));

    const reserved = participants.filter((p) => p.status === "reserved").length;
    const finalPaid = participants.filter((p) => p.status === "final_paid").length;
    const cancelled = participants.filter((p) => p.status === "cancelled").length;
    const dropped = participants.filter((p) => p.status === "dropped_unpaid").length;

    res.json({
      matchId,
      reserveCollected,
      finalCollected,
      totalRevenue: reserveCollected + finalCollected,
      reservedCount: reserved,
      finalPaidCount: finalPaid,
      cancelledCount: cancelled,
      droppedCount: dropped,
      currentPlayers: match.currentPlayers,
      totalPlayers: match.totalPlayers,
      minPlayers: match.minPlayers,
      status: match.status,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching match finance");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch match finance" });
  }
});

// ─── Drop Spot (participant self-drop + reopen) ────────────────────────────
router.post("/hosted-matches/:matchId/drop-spot", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const matchId = req.params.matchId as string;
    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }

    if (["cancelled", "cancelled_underfilled", "completed"].includes(match.status)) {
      res.status(400).json({ error: "invalid_state", message: "Cannot drop from a closed match" });
      return;
    }

    const [participant] = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(and(
        eq(hostedMatchParticipantsTable.matchId, matchId),
        eq(hostedMatchParticipantsTable.userId, profile.id),
      ))
      .limit(1);

    if (!participant) {
      res.status(404).json({ error: "not_found", message: "You are not a participant of this match" });
      return;
    }
    if (participant.status === "cancelled" || participant.status === "dropped_unpaid") {
      res.status(400).json({ error: "already_dropped", message: "Already dropped from this match" });
      return;
    }

    // Mark participant cancelled
    await db
      .update(hostedMatchParticipantsTable)
      .set({ status: "cancelled", droppedAt: new Date(), droppedReason: "Participant self-dropped", updatedAt: new Date() })
      .where(eq(hostedMatchParticipantsTable.id, participant.id));

    // Decrement player count and reopen if was confirmed
    const newCount = Math.max(0, match.currentPlayers - 1);
    const newStatus = newCount < match.minPlayers && match.status === "confirmed" ? "open" : match.status;
    await db
      .update(hostedMatchesTable)
      .set({ currentPlayers: newCount, status: newStatus as any, updatedAt: new Date() })
      .where(eq(hostedMatchesTable.id, matchId));

    // Refund reserve fee to wallet
    if (participant.reservePaymentId) {
      try {
        const { processCancellationRefund } = await import("../lib/refund-routing");
        await processCancellationRefund(profile.id, participant.id, "hosted_match", Number(match.reserveFee ?? 0));
      } catch (e) { /* non-fatal */ }
    }

    // Notify host
    await db.insert(notificationsTable).values({
      userId: match.hostUserId,
      type: "player_dropped_unpaid" as const,
      title: "A player dropped out",
      body: `${profile.fullName} has dropped from your ${match.sport} match on ${match.date}. A spot is now open.`,
      referenceId: matchId,
    });

    // Notify host and all remaining participants if spot is reopened
    if (newStatus === "open" && match.status === "confirmed") {
      await db.insert(notificationsTable).values({
        userId: match.hostUserId,
        type: "match_reopened" as const,
        title: "Match Spot Reopened",
        body: `Your ${match.sport} match on ${match.date} has an open spot. Share to refill!`,
        referenceId: matchId,
      });
    }

    res.json({ matchId, status: newStatus, currentPlayers: newCount, message: "Spot dropped and reopened" });
  } catch (err) {
    req.log.error({ err }, "Error dropping spot");
    res.status(500).json({ error: "internal_error", message: "Failed to drop spot" });
  }
});

router.post("/hosted-matches/:matchId/rehost", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const matchId = req.params.matchId as string;
    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }
    if (match.hostUserId !== profile.id) { res.status(403).json({ error: "forbidden", message: "Not the host" }); return; }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const newDate = tomorrow.toISOString().slice(0, 10);

    const [slot] = await db.select({ status: slotsTable.status }).from(slotsTable).where(eq(slotsTable.id, match.slotId)).limit(1);
    if (!slot) { res.status(404).json({ error: "not_found", message: "Slot not found" }); return; }
    if (slot.status !== "available") {
      res.status(409).json({ error: "conflict", message: "Slot no longer available for rehost" });
      return;
    }

    const [newMatch] = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(hostedMatchesTable).values({
        hostUserId: profile.id,
        venueId: match.venueId,
        slotId: match.slotId,
        sport: match.sport,
        date: newDate,
        startTime: match.startTime,
        endTime: match.endTime,
        totalPlayers: match.totalPlayers,
        minPlayers: match.minPlayers,
        currentPlayers: 0,
        hostFee: match.hostFee,
        reserveFee: match.reserveFee,
        finalFeePerPlayer: match.finalFeePerPlayer,
        totalVenueCost: match.totalVenueCost,
        skillLevel: match.skillLevel,
        platformFeeTotal: match.platformFeeTotal,
        notes: match.notes ? `[Rehosted] ${match.notes}` : "Rehosted match",
        status: "open",
        financialStatus: "pending",
        grossHostCollected: 0,
        grossReserveCollected: 0,
        grossFinalCollected: 0,
        totalCollected: 0,
        refundExposure: 0,
      }).returning({ id: hostedMatchesTable.id });

      // HM8 FORENSIC PATCH — slot state normalization: REHOST must ONLY use slot.status = 'available'
      await tx.update(slotsTable).set({ status: "available" }).where(eq(slotsTable.id, match.slotId));
      return [inserted];
    });

    res.json({ matchId: newMatch.id, date: newDate, message: "New match created from rehost" });
  } catch (err) {
    req.log.error({ err }, "Error rehosting match");
    res.status(500).json({ error: "internal_error", message: "Failed to rehost match" });
  }
});

export default router;

