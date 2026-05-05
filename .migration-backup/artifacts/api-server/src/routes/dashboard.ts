import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  bookingsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  notificationsTable,
  badgesTable,
  paymentsTable,
  venuesTable,
} from "@workspace/db";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const [bookings, myMatches, joinedParticipants, badges] = await Promise.all([
      db.select().from(bookingsTable).where(eq(bookingsTable.userId, profile.id)).orderBy(desc(bookingsTable.createdAt)).limit(20),
      db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.hostUserId, profile.id)),
      db.select().from(hostedMatchParticipantsTable).where(eq(hostedMatchParticipantsTable.userId, profile.id)),
      db.select().from(badgesTable).where(eq(badgesTable.userId, profile.id)).limit(10),
    ]);

    const upcomingBookings = bookings.filter((b) => b.status === "confirmed").slice(0, 5);
    const confirmedMatches = myMatches.filter((m) => m.status === "confirmed" || m.status === "funded").slice(0, 5);

    const pendingFinalPaymentsCount = joinedParticipants.filter(
      (p) => p.status === "reserved",
    ).length;

    // Fetch venues for upcoming bookings and confirmed matches
    const bookingVenueIds = upcomingBookings.map((b) => b.venueId);
    const matchVenueIds = confirmedMatches.map((m) => m.venueId);
    const allVenueIds = [...new Set([...bookingVenueIds, ...matchVenueIds])];
    const venues =
      allVenueIds.length > 0
        ? await db.select().from(venuesTable).where(inArray(venuesTable.id, allVenueIds))
        : [];
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    res.json({
      upcomingBookingsCount: upcomingBookings.length,
      totalMatchesJoined: joinedParticipants.length,
      totalMatchesHosted: myMatches.length,
      walletBalance: Number(profile.walletBalance),
      pendingFinalPaymentsCount,
      upcomingBookings: upcomingBookings.map((b) => {
        const venue = venueMap.get(b.venueId);
        return {
          id: b.id,
          userId: b.userId,
          venueId: b.venueId,
          slotId: b.slotId,
          sport: b.sport,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          totalAmount: Number(b.totalAmount),
          status: b.status,
          paymentId: b.paymentId ?? null,
          createdAt: b.createdAt.toISOString(),
          venue: venue ? {
            id: venue.id,
            name: venue.name,
            city: venue.city,
            address: venue.address,
            sports: venue.sports ?? [],
            pricePerHour: Number(venue.pricePerHour),
            coverImage: venue.coverImage ?? null,
            rating: Number(venue.rating),
            totalReviews: venue.totalReviews,
            isApproved: venue.isApproved,
            amenities: venue.amenities ?? [],
          } : null,
        };
      }),
      confirmedMatches: confirmedMatches.map((m) => {
        const v = venueMap.get(m.venueId);
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
          venue: v
            ? {
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
              }
            : null,
          host: null,
        };
      }),
      badges: badges.map((b) => ({
        id: b.id,
        slug: b.slug,
        label: b.label,
        description: b.description,
        icon: b.icon,
        earnedAt: b.earnedAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching dashboard");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch dashboard" });
  }
});

router.get("/dashboard/activity", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, profile.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);

    const typeMap: Record<string, string> = {
      payment_success: "booking_confirmed",
      match_joined: "match_joined",
      match_confirmed: "match_confirmed",
      badge_earned: "badge_earned",
    };

    res.json(
      notifications.map((n) => ({
        id: n.id,
        type: typeMap[n.type] ?? "payment_success",
        title: n.title,
        description: n.body,
        createdAt: n.createdAt.toISOString(),
        referenceId: n.referenceId ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching activity");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch activity" });
  }
});

export default router;
