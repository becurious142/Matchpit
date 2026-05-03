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
import { eq, count, sum, desc } from "drizzle-orm";
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

    res.json(
      bookings.map((b) => ({
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
        venue: null,
      })),
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

    res.json(
      matches.map((m) => ({
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
        venue: null,
        host: null,
      })),
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

export default router;
