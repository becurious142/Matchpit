import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  venuesTable,
  bookingsTable,
  hostedMatchesTable,
  venuePayoutLedgerTable,
  slotsTable,
} from "@workspace/db";
import { eq, and, gte, sum, count, desc } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

async function getOwnerVenues(profileId: string) {
  return db
    .select()
    .from(venuesTable)
    .where(eq(venuesTable.ownerUserId, profileId));
}

router.get("/owner/venues", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const venues = await getOwnerVenues(profile.id);
    res.json(venues.map((v) => ({
      id: v.id,
      name: v.name,
      city: v.city,
      address: v.address,
      sports: v.sports ?? [],
      pricePerHour: Number(v.pricePerHour),
      coverImage: v.coverImage ?? null,
      isApproved: v.isApproved,
      isFeatured: v.isFeatured,
      openTime: v.openTime,
      closeTime: v.closeTime,
      contactPhone: v.contactPhone ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing owner venues");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch venues" });
  }
});

router.get("/owner/dashboard", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const venues = await getOwnerVenues(profile.id);

    if (!venues.length) {
      res.json({ hasVenues: false, venues: [], summary: null });
      return;
    }

    const venueIds = venues.map((v) => v.id);
    const today = new Date().toISOString().slice(0, 10);

    const [bookingsToday, totalBookings, pendingPayoutsResult, paidPayoutsResult, upcomingMatches] = await Promise.all([
      db.select({ c: count() }).from(bookingsTable)
        .where(and(eq(bookingsTable.status, "confirmed"), eq(bookingsTable.date, today),
          venueIds.length === 1 ? eq(bookingsTable.venueId, venueIds[0]) : eq(bookingsTable.venueId, venueIds[0]))),
      db.select({ c: count() }).from(bookingsTable)
        .where(and(eq(bookingsTable.status, "confirmed"),
          venueIds.length === 1 ? eq(bookingsTable.venueId, venueIds[0]) : eq(bookingsTable.venueId, venueIds[0]))),
      db.select({ total: sum(venuePayoutLedgerTable.venuePayable) }).from(venuePayoutLedgerTable)
        .where(and(eq(venuePayoutLedgerTable.status, "pending"),
          venueIds.length === 1 ? eq(venuePayoutLedgerTable.venueId, venueIds[0]) : eq(venuePayoutLedgerTable.venueId, venueIds[0]))),
      db.select({ total: sum(venuePayoutLedgerTable.venuePayable) }).from(venuePayoutLedgerTable)
        .where(and(eq(venuePayoutLedgerTable.status, "paid"),
          venueIds.length === 1 ? eq(venuePayoutLedgerTable.venueId, venueIds[0]) : eq(venuePayoutLedgerTable.venueId, venueIds[0]))),
      db.select().from(hostedMatchesTable)
        .where(and(
          gte(hostedMatchesTable.date, today),
          venueIds.length === 1 ? eq(hostedMatchesTable.venueId, venueIds[0]) : eq(hostedMatchesTable.venueId, venueIds[0]),
        ))
        .orderBy(hostedMatchesTable.date)
        .limit(5),
    ]);

    const pendingPayout = Number(pendingPayoutsResult[0]?.total ?? 0);
    const paidPayout = Number(paidPayoutsResult[0]?.total ?? 0);

    res.json({
      hasVenues: true,
      venues: venues.map((v) => ({ id: v.id, name: v.name, city: v.city })),
      summary: {
        bookingsToday: Number(bookingsToday[0]?.c ?? 0),
        totalConfirmedBookings: Number(totalBookings[0]?.c ?? 0),
        pendingPayoutAmount: pendingPayout,
        paidPayoutAmount: paidPayout,
        totalEarnings: pendingPayout + paidPayout,
        upcomingMatchCount: upcomingMatches.length,
      },
      upcomingMatches: upcomingMatches.map((m) => ({
        id: m.id,
        sport: m.sport,
        date: m.date,
        startTime: m.startTime,
        endTime: m.endTime,
        currentPlayers: m.currentPlayers,
        totalPlayers: m.totalPlayers,
        status: m.status,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching owner dashboard");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch dashboard" });
  }
});

router.get("/owner/bookings", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const venues = await getOwnerVenues(profile.id);
    if (!venues.length) { res.json([]); return; }

    const venueId = venues[0].id;
    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.venueId, venueId), eq(bookingsTable.status, "confirmed")))
      .orderBy(desc(bookingsTable.date))
      .limit(50);

    res.json(bookings.map((b) => ({
      id: b.id,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      sport: b.sport,
      totalAmount: Number(b.totalAmount),
      status: b.status,
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching owner bookings");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch bookings" });
  }
});

router.get("/owner/payouts", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    const venues = await getOwnerVenues(profile.id);
    if (!venues.length) { res.json([]); return; }

    const venueId = venues[0].id;
    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.venueId, venueId))
      .orderBy(desc(venuePayoutLedgerTable.createdAt))
      .limit(50);

    res.json(payouts.map((p) => ({
      id: p.id,
      referenceType: p.referenceType,
      grossAmount: Number(p.grossAmount),
      platformCommission: Number(p.platformCommission),
      venuePayable: Number(p.venuePayable),
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching owner payouts");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch payouts" });
  }
});

export default router;
