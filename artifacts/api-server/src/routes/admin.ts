import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  profilesTable,
  venuesTable,
  bookingsTable,
  hostedMatchesTable,
  paymentsTable,
  ownerLeadsTable,
} from "@workspace/db";
import { eq, count, sum, desc, inArray } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

async function requireAdmin(req: any, res: any) {
  const { userId } = getAuth(req);
  const profile = await getProfileByClerkId(userId!);
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Admin access required" });
    return null;
  }
  return profile;
}

router.get("/admin/stats", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [users, venues, bookings, matches, payments, ownerLeads] = await Promise.all([
      db.select({ count: count() }).from(profilesTable),
      db.select({ count: count() }).from(venuesTable),
      db.select({ count: count() }).from(bookingsTable),
      db.select({ count: count() }).from(hostedMatchesTable),
      db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.status, "success")),
      db.select({ count: count() }).from(ownerLeadsTable).where(eq(ownerLeadsTable.status, "new")),
    ]);

    const pendingVenues = await db.select({ count: count() }).from(venuesTable).where(eq(venuesTable.isApproved, false));
    const activeMatches = await db.select({ count: count() }).from(hostedMatchesTable).where(eq(hostedMatchesTable.status, "open"));

    res.json({
      totalUsers: users[0]?.count ?? 0,
      totalVenues: venues[0]?.count ?? 0,
      totalBookings: bookings[0]?.count ?? 0,
      totalHostedMatches: matches[0]?.count ?? 0,
      totalRevenue: Number(payments[0]?.total ?? 0),
      activeMatches: activeMatches[0]?.count ?? 0,
      pendingVenueApprovals: pendingVenues[0]?.count ?? 0,
      newOwnerLeads: ownerLeads[0]?.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching admin stats");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch stats" });
  }
});

router.get("/admin/users", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
    const limit = Math.min(100, parseInt(req.query.limit as string ?? "20"));
    const offset = (page - 1) * limit;

    const users = await db.select().from(profilesTable).orderBy(desc(profilesTable.createdAt)).limit(limit).offset(offset);
    const [{ count: total }] = await db.select({ count: count() }).from(profilesTable);

    res.json({
      users: users.map((u) => ({
        id: u.id,
        clerkId: u.clerkId,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone ?? null,
        city: u.city ?? null,
        favoriteSports: u.favoriteSports ?? [],
        avatarUrl: u.avatarUrl ?? null,
        walletBalance: Number(u.walletBalance),
        badgeCount: u.badgeCount,
        trustScore: Number(u.trustScore),
        isAdmin: u.isAdmin,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page,
    });
  } catch (err) {
    req.log.error({ err }, "Error listing admin users");
    res.status(500).json({ error: "internal_error", message: "Failed to list users" });
  }
});

router.get("/admin/bookings", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
    const bookings = await db
      .select()
      .from(bookingsTable)
      .orderBy(desc(bookingsTable.createdAt))
      .limit(50)
      .offset((page - 1) * 50);

    const venueIds = [...new Set(bookings.map((b) => b.venueId))];
    const venues =
      venueIds.length > 0
        ? await db.select().from(venuesTable).where(inArray(venuesTable.id, venueIds))
        : [];
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    res.json(
      bookings.map((b) => {
        const v = venueMap.get(b.venueId);
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
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing admin bookings");
    res.status(500).json({ error: "internal_error", message: "Failed to list bookings" });
  }
});

router.get("/admin/hosted-matches", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .orderBy(desc(hostedMatchesTable.createdAt))
      .limit(50);

    const venueIds = [...new Set(matches.map((m) => m.venueId))];
    const hostUserIds = [...new Set(matches.map((m) => m.hostUserId))];

    const [venues, hosts] = await Promise.all([
      venueIds.length > 0
        ? db.select().from(venuesTable).where(inArray(venuesTable.id, venueIds))
        : Promise.resolve([]),
      hostUserIds.length > 0
        ? db.select().from(profilesTable).where(inArray(profilesTable.id, hostUserIds))
        : Promise.resolve([]),
    ]);

    const venueMap = new Map(venues.map((v) => [v.id, v]));
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    res.json(
      matches.map((m) => {
        const v = venueMap.get(m.venueId);
        const h = hostMap.get(m.hostUserId);
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
          host: h
            ? {
                id: h.id,
                fullName: h.fullName,
                email: h.email,
                phone: h.phone ?? null,
                city: h.city ?? null,
                avatarUrl: h.avatarUrl ?? null,
                trustScore: Number(h.trustScore),
              }
            : null,
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing admin matches");
    res.status(500).json({ error: "internal_error", message: "Failed to list matches" });
  }
});

router.get("/admin/payments", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
    const payments = await db
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.createdAt))
      .limit(50)
      .offset((page - 1) * 50);

    res.json(
      payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        type: p.type,
        referenceId: p.referenceId ?? null,
        razorpayOrderId: p.razorpayOrderId ?? null,
        razorpayPaymentId: p.razorpayPaymentId ?? null,
        amount: Number(p.amount),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing admin payments");
    res.status(500).json({ error: "internal_error", message: "Failed to list payments" });
  }
});

router.patch("/admin/venues/:venueId/approve", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const venueId = req.params.venueId as string;
    const { isApproved } = req.body as { isApproved: boolean };

    const [updated] = await db
      .update(venuesTable)
      .set({ isApproved, updatedAt: new Date() })
      .where(eq(venuesTable.id, venueId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    res.json({
      id: updated.id,
      name: updated.name,
      city: updated.city,
      address: updated.address,
      sports: updated.sports ?? [],
      pricePerHour: Number(updated.pricePerHour),
      coverImage: updated.coverImage ?? null,
      rating: Number(updated.rating),
      totalReviews: updated.totalReviews,
      isApproved: updated.isApproved,
      amenities: updated.amenities ?? [],
      images: updated.images ?? [],
      description: updated.description ?? null,
      openTime: updated.openTime,
      closeTime: updated.closeTime,
      contactPhone: updated.contactPhone ?? null,
      ownerName: updated.ownerName ?? null,
      upcomingMatches: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error approving venue");
    res.status(500).json({ error: "internal_error", message: "Failed to approve venue" });
  }
});

router.patch("/admin/venues/:venueId/featured", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const venueId = req.params.venueId as string;
    const { isFeatured } = req.body as { isFeatured: boolean };

    const [updated] = await db
      .update(venuesTable)
      .set({ isFeatured, updatedAt: new Date() })
      .where(eq(venuesTable.id, venueId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    res.json({
      id: updated.id,
      name: updated.name,
      city: updated.city,
      address: updated.address,
      sports: updated.sports ?? [],
      pricePerHour: Number(updated.pricePerHour),
      coverImage: updated.coverImage ?? null,
      rating: Number(updated.rating),
      totalReviews: updated.totalReviews,
      isApproved: updated.isApproved,
      amenities: updated.amenities ?? [],
      images: updated.images ?? [],
      description: updated.description ?? null,
      openTime: updated.openTime,
      closeTime: updated.closeTime,
      contactPhone: updated.contactPhone ?? null,
      ownerName: updated.ownerName ?? null,
      upcomingMatches: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error setting venue featured");
    res.status(500).json({ error: "internal_error", message: "Failed to update venue" });
  }
});

router.get("/admin/venues", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const venues = await db.select().from(venuesTable).orderBy(desc(venuesTable.createdAt));

    res.json(
      venues.map((v) => ({
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
        images: v.images ?? [],
        description: v.description ?? null,
        openTime: v.openTime,
        closeTime: v.closeTime,
        contactPhone: v.contactPhone ?? null,
        ownerName: v.ownerName ?? null,
        upcomingMatches: 0,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing admin venues");
    res.status(500).json({ error: "internal_error", message: "Failed to list venues" });
  }
});

router.get("/admin/owner-leads", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leads = await db.select().from(ownerLeadsTable).orderBy(desc(ownerLeadsTable.createdAt));

    res.json(
      leads.map((l) => ({
        id: l.id,
        venueName: l.venueName,
        ownerName: l.ownerName,
        phone: l.phone,
        city: l.city,
        sports: l.sports ?? [],
        message: l.message ?? null,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing owner leads");
    res.status(500).json({ error: "internal_error", message: "Failed to list leads" });
  }
});

router.patch("/admin/owner-leads/:leadId/status", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leadId = req.params.leadId as string;
    const { status } = req.body as { status: "new" | "contacted" | "onboarded" | "rejected" };

    const [updated] = await db
      .update(ownerLeadsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ownerLeadsTable.id, leadId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Lead not found" });
      return;
    }

    res.json({
      id: updated.id,
      venueName: updated.venueName,
      ownerName: updated.ownerName,
      phone: updated.phone,
      city: updated.city,
      sports: updated.sports ?? [],
      message: updated.message ?? null,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating owner lead status");
    res.status(500).json({ error: "internal_error", message: "Failed to update lead" });
  }
});

export default router;
