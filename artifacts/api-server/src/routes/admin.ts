import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  profilesTable,
  venuesTable,
  bookingsTable,
  hostedMatchesTable,
  ownerLeadsTable,
  venuePayoutLedgerTable,
} from "@workspace/db";
import { eq, count, sum, desc, inArray, ne } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import {
  regenerateVenueSlotsForNext14Days,
  backfillVenuePricingDefaults,
} from "../utils/regenerateVenueSlots";

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
      db.select({ count: count() }).from(profilesTable).where(ne(profilesTable.isAdmin, true)),
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

    const users = await db.select().from(profilesTable).where(ne(profilesTable.isAdmin, true)).orderBy(desc(profilesTable.createdAt)).limit(limit).offset(offset);
    const [{ count: total }] = await db.select({ count: count() }).from(profilesTable).where(ne(profilesTable.isAdmin, true));

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

router.get("/admin/finance/settlements", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Fetch all venues
    const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
    const venueMap = new Map<string, any>();
    
    for (const v of venues) {
      venueMap.set(v.id, {
        venueId: v.id,
        venueName: v.name,
        totalGross: 0,
        totalPlatformRevenue: 0,
        totalGatewayFees: 0,
        totalVenuePayable: 0,
        totalReversals: 0,
        readyForSettlement: 0,
        pendingRows: 0,
        completedMatches: 0,
      });
    }

    // Fetch all relevant payouts
    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .where(inArray(venuePayoutLedgerTable.status, ["pending", "ready_for_settlement"]));

    for (const p of payouts) {
      const v = venueMap.get(p.venueId);
      if (!v) continue;

      const gross = Number(p.grossAmount || 0);
      const isReversal = p.notes?.includes("REVERSAL") || gross < 0;

      if (!isReversal) {
        v.totalGross += gross;
      } else {
        // Track the total reversed amount separately as a positive sum for visibility
        v.totalReversals += Math.abs(gross);
      }

      v.totalPlatformRevenue += Number(p.platformCommission || 0);
      v.totalGatewayFees += Number(p.razorpayFee || 0);
      v.totalVenuePayable += Number(p.venuePayable || 0);

      if (p.status === "ready_for_settlement") {
        v.readyForSettlement += Number(p.venuePayable || 0);
      } else if (p.status === "pending") {
        v.pendingRows += 1;
      }
    }

    // Count completed matches per venue
    const completedMatches = await db
      .select({ venueId: hostedMatchesTable.venueId })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.status, "completed"));

    for (const m of completedMatches) {
      const v = venueMap.get(m.venueId);
      if (v) {
        v.completedMatches += 1;
      }
    }

    res.json({ venues: Array.from(venueMap.values()) });
  } catch (err) {
    req.log.error({ err }, "Error listing settlements");
    res.status(500).json({ error: "internal_error", message: "Failed to list settlements" });
  }
});

// ─── Venue: approve (boolean toggle, kept for backwards compat) ───────────────

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

// ─── Venue: activate (sets isApproved=true and regenerates slots) ─────────────

router.post("/admin/venues/:venueId/activate", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const venueId = req.params.venueId as string;

    const [existing] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId));
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    const hasPricing =
      existing.weekdayMorningPrice > 0 &&
      existing.weekdayDayPrice > 0 &&
      existing.weekdayEveningPrice > 0 &&
      existing.weekendPrice > 0;
    const hasHours = !!(existing.openTime && existing.closeTime);
    const hasSports = Array.isArray(existing.sports) && existing.sports.length > 0;
    const hasImages = !!(existing.coverImage || (Array.isArray(existing.images) && existing.images.length > 0));
    const hasOwnerLinked = existing.ownerUserId !== null;
    const isReadyForActivation =
      hasPricing && hasHours && hasSports && hasImages && hasOwnerLinked;

    if (!isReadyForActivation) {
      res.status(400).json({ message: "Venue setup incomplete" });
      return;
    }

    await db
      .update(venuesTable)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(venuesTable.id, venueId));

    await backfillVenuePricingDefaults();
    await regenerateVenueSlotsForNext14Days();

    res.json({ activated: true, venueId });
  } catch (err) {
    req.log.error({ err }, "Error activating venue");
    res.status(500).json({ error: "internal_error", message: "Failed to activate venue" });
  }
});

// ─── Venue: featured ─────────────────────────────────────────────────────────

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

// ─── Venue: list ──────────────────────────────────────────────────────────────

router.get("/admin/venues", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const venues = await db.select().from(venuesTable).orderBy(desc(venuesTable.createdAt));

    res.json(
      venues.map((v) => {
        const hasPricing =
          v.weekdayMorningPrice > 0 &&
          v.weekdayDayPrice > 0 &&
          v.weekdayEveningPrice > 0 &&
          v.weekendPrice > 0;
        const hasHours = !!(v.openTime && v.closeTime);
        const hasSports = Array.isArray(v.sports) && v.sports.length > 0;
        const hasImages = !!(v.coverImage || (Array.isArray(v.images) && v.images.length > 0));
        const hasOwnerLinked = v.ownerUserId !== null;
        const isReadyForActivation =
          hasPricing && hasHours && hasSports && hasImages && hasOwnerLinked;

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
          isFeatured: v.isFeatured,
          amenities: v.amenities ?? [],
          images: v.images ?? [],
          description: v.description ?? null,
          openTime: v.openTime,
          closeTime: v.closeTime,
          contactPhone: v.contactPhone ?? null,
          ownerName: v.ownerName ?? null,
          upcomingMatches: 0,
          setupChecklist: {
            hasPricing,
            hasHours,
            hasSports,
            hasImages,
            hasOwnerLinked,
            isReadyForActivation,
          },
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing admin venues");
    res.status(500).json({ error: "internal_error", message: "Failed to list venues" });
  }
});

// ─── Owner Leads: list ────────────────────────────────────────────────────────

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
        venueId: l.venueId ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing owner leads");
    res.status(500).json({ error: "internal_error", message: "Failed to list leads" });
  }
});

// ─── Owner Leads: update status ───────────────────────────────────────────────

router.patch("/admin/owner-leads/:leadId/status", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leadId = req.params.leadId as string;
    const { status } = req.body as {
      status: "new" | "qualified" | "onboarded" | "rejected";
    };

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
      venueId: updated.venueId ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating owner lead status");
    res.status(500).json({ error: "internal_error", message: "Failed to update lead" });
  }
});

// ─── Owner Leads: convert to venue ───────────────────────────────────────────

router.post("/admin/owner-leads/:leadId/convert", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leadId = req.params.leadId as string;

    const [lead] = await db.select().from(ownerLeadsTable).where(eq(ownerLeadsTable.id, leadId));

    if (!lead) {
      res.status(404).json({ error: "not_found", message: "Lead not found" });
      return;
    }
    if (lead.venueId) {
      res.status(409).json({ error: "already_converted", message: "Lead already linked to a venue" });
      return;
    }

    let ownerUserId: string | null = null;
    if (lead.phone) {
      const [profileByPhone] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.phone, lead.phone));
      if (profileByPhone) {
        ownerUserId = profileByPhone.id;
      }
    }
    // Note: ownerLeadsTable doesn't have an email column in this schema, so we only search by phone.

    const [venue] = await db
      .insert(venuesTable)
      .values({
        name: lead.venueName,
        city: lead.city,
        address: lead.city,
        sports: lead.sports ?? [],
        pricePerHour: "0",
        weekdayMorningPrice: 0,
        weekdayDayPrice: 0,
        weekdayEveningPrice: 0,
        weekendPrice: 0,
        slotIntervalMins: 60,
        openTime: "06:00",
        closeTime: "23:00",
        ownerName: lead.ownerName,
        contactPhone: lead.phone,
        ownerUserId,
        isApproved: false,
      })
      .returning();

    await db
      .update(ownerLeadsTable)
      .set({ venueId: venue.id, status: "onboarded", updatedAt: new Date() })
      .where(eq(ownerLeadsTable.id, leadId));

    res.status(201).json({
      success: true,
      venueId: venue.id,
      venueName: venue.name,
      ownerLinked: !!ownerUserId,
    });
  } catch (err) {
    req.log.error({ err }, "Error converting lead to venue");
    res.status(500).json({ error: "internal_error", message: "Failed to convert lead" });
  }
});

// ─── Onboarding Workflow (Batch A7) ──────────────────────────────────────────

function computeSetupChecklist(v: any, ownerUserId: string | null) {
  const hasPricing =
    v.weekdayMorningPrice > 0 &&
    v.weekdayDayPrice > 0 &&
    v.weekdayEveningPrice > 0 &&
    v.weekendPrice > 0;
  const hasHours = !!(v.openTime && v.closeTime);
  const hasSports = Array.isArray(v.sports) && v.sports.length > 0;
  const hasImages = !!(v.coverImage || (Array.isArray(v.images) && v.images.length > 0));
  const hasOwnerLinked = ownerUserId !== null;
  const isReadyForActivation = hasPricing && hasHours && hasSports && hasImages && hasOwnerLinked;

  return {
    hasPricing,
    hasHours,
    hasSports,
    hasImages,
    hasOwnerLinked,
    isReadyForActivation,
  };
}

router.get("/admin/onboarding", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leads = await db
      .select()
      .from(ownerLeadsTable)
      .where(ne(ownerLeadsTable.status, "rejected"))
      .orderBy(desc(ownerLeadsTable.createdAt));

    const venueIds = leads.map((l) => l.venueId).filter(Boolean) as string[];
    const venues = venueIds.length > 0 
      ? await db.select().from(venuesTable).where(inArray(venuesTable.id, venueIds))
      : [];
    const venueMap = new Map(venues.map((v) => [v.id, v]));


    const results: any[] = [];
    for (const l of leads) {
      // Skip fully onboarded leads regardless of venue state
      if (l.status === "onboarded") continue;

      let v: typeof venues[0] | null = null;
      if (l.venueId) {
        v = venueMap.get(l.venueId) ?? null;
        // Skip if linked venue is already live
        if (v && v.isApproved) continue;
      }

      let ownerUserId = v?.ownerUserId ?? null;
      if (!ownerUserId && l.phone) {
        const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.phone, l.phone));
        if (profile) ownerUserId = profile.id;
      }

      const setupChecklist = v ? computeSetupChecklist(v, ownerUserId) : {
        hasPricing: false, hasHours: false, hasSports: false, hasImages: false,
        hasOwnerLinked: ownerUserId !== null, isReadyForActivation: false
      };

      results.push({
        lead: {
          id: l.id,
          venueName: l.venueName,
          ownerName: l.ownerName,
          phone: l.phone,
          city: l.city,
          sports: l.sports ?? [],
          message: l.message ?? null,
          status: l.status,
          createdAt: l.createdAt.toISOString(),
        },
        draftVenue: v ? {
          id: v.id,
          name: v.name,
          pricePerHour: Number(v.pricePerHour),
          weekdayMorningPrice: v.weekdayMorningPrice,
          weekdayDayPrice: v.weekdayDayPrice,
          weekdayEveningPrice: v.weekdayEveningPrice,
          weekendPrice: v.weekendPrice,
          slotIntervalMins: v.slotIntervalMins,
          openTime: v.openTime,
          closeTime: v.closeTime,
          sports: v.sports,
          coverImage: v.coverImage,
          images: v.images ?? [],
          isOnboardingDraft: v.isOnboardingDraft,
        } : null,
        setupChecklist,
        ownerUserId,
      });
    }

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing onboarding items");
    res.status(500).json({ error: "internal_error", message: "Failed to list onboarding items" });
  }

});

router.patch("/admin/onboarding/:leadId", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leadId = req.params.leadId as string;
    const body = req.body; 

    const [lead] = await db.select().from(ownerLeadsTable).where(eq(ownerLeadsTable.id, leadId));
    if (!lead) {
      res.status(404).json({ error: "not_found", message: "Lead not found" });
      return;
    }

    let v: typeof venuesTable.$inferSelect;
    if (!lead.venueId) {
      // Atomic: insert draft + link lead in a single transaction to prevent race duplicates
      v = await db.transaction(async (tx) => {
        // Re-read lead inside transaction to catch concurrent autosaves
        const [freshLead] = await tx.select().from(ownerLeadsTable).where(eq(ownerLeadsTable.id, leadId));
        if (freshLead.venueId) {
          // Another request beat us — return existing venue
          const [existing] = await tx.select().from(venuesTable).where(eq(venuesTable.id, freshLead.venueId));
          return existing;
        }
        const [newVenue] = await tx.insert(venuesTable).values({
          name: body.name ?? lead.venueName,
          city: lead.city,
          address: body.address ?? lead.city,
          sports: body.sports ?? lead.sports ?? [],
          pricePerHour: body.pricePerHour ? String(body.pricePerHour) : "0",
          weekdayMorningPrice: body.weekdayMorningPrice ?? 0,
          weekdayDayPrice: body.weekdayDayPrice ?? 0,
          weekdayEveningPrice: body.weekdayEveningPrice ?? 0,
          weekendPrice: body.weekendPrice ?? 0,
          slotIntervalMins: body.slotIntervalMins ?? 60,
          openTime: body.openTime ?? "06:00",
          closeTime: body.closeTime ?? "23:00",
          coverImage: body.coverImage ?? null,
          images: body.images ?? [],
          ownerName: lead.ownerName,
          contactPhone: lead.phone,
          isApproved: false,
          isOnboardingDraft: true,
        }).returning();
        await tx.update(ownerLeadsTable).set({ venueId: newVenue.id, updatedAt: new Date() }).where(eq(ownerLeadsTable.id, leadId));
        return newVenue;
      });
    } else {
      const [existing] = await db.select().from(venuesTable).where(eq(venuesTable.id, lead.venueId));
      if (!existing) {
        res.status(404).json({ error: "not_found", message: "Venue draft not found" });
        return;
      }

      const updateData: Partial<typeof venuesTable.$inferInsert> = { updatedAt: new Date() };
      if (body.name !== undefined) updateData.name = body.name;
      if (body.pricePerHour !== undefined) updateData.pricePerHour = String(body.pricePerHour);
      if (body.weekdayMorningPrice !== undefined) updateData.weekdayMorningPrice = body.weekdayMorningPrice;
      if (body.weekdayDayPrice !== undefined) updateData.weekdayDayPrice = body.weekdayDayPrice;
      if (body.weekdayEveningPrice !== undefined) updateData.weekdayEveningPrice = body.weekdayEveningPrice;
      if (body.weekendPrice !== undefined) updateData.weekendPrice = body.weekendPrice;
      if (body.slotIntervalMins !== undefined) updateData.slotIntervalMins = body.slotIntervalMins;
      if (body.openTime !== undefined) updateData.openTime = body.openTime;
      if (body.closeTime !== undefined) updateData.closeTime = body.closeTime;
      if (body.coverImage !== undefined) updateData.coverImage = body.coverImage;
      if (body.images !== undefined) updateData.images = body.images;
      if (body.sports !== undefined) updateData.sports = body.sports;

      if (Object.keys(updateData).length > 1) { 
        const [updated] = await db.update(venuesTable).set(updateData).where(eq(venuesTable.id, lead.venueId)).returning();
        v = updated;
      } else {
        v = existing;
      }
    }

    let ownerUserId = v.ownerUserId ?? null;
    if (!ownerUserId && lead.phone) {
      const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.phone, lead.phone));
      if (profile) ownerUserId = profile.id;
    }

    const setupChecklist = computeSetupChecklist(v, ownerUserId);

    res.json({ success: true, draftVenue: v, setupChecklist });
  } catch (err) {
    req.log.error({ err }, "Error updating onboarding draft");
    res.status(500).json({ error: "internal_error", message: "Failed to update draft" });
  }
});

router.post("/admin/onboarding/:leadId/go-live", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leadId = req.params.leadId as string;
    const [lead] = await db.select().from(ownerLeadsTable).where(eq(ownerLeadsTable.id, leadId));
    if (!lead || !lead.venueId) {
      res.status(400).json({ error: "invalid_state", message: "Lead not found or draft venue not created" });
      return;
    }

    const [v] = await db.select().from(venuesTable).where(eq(venuesTable.id, lead.venueId));
    if (!v) {
      res.status(404).json({ error: "not_found", message: "Venue draft not found" });
      return;
    }

    let ownerUserId = v.ownerUserId ?? null;
    if (!ownerUserId && lead.phone) {
      const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.phone, lead.phone));
      if (profile) ownerUserId = profile.id;
    }

    const setupChecklist = computeSetupChecklist(v, ownerUserId);
    if (!setupChecklist.isReadyForActivation) {
      res.status(400).json({ error: "incomplete", message: "Setup checklist incomplete", setupChecklist });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(venuesTable)
        .set({ isApproved: true, isOnboardingDraft: false, ownerUserId, updatedAt: new Date() })
        .where(eq(venuesTable.id, v.id));

      await tx.update(ownerLeadsTable)
        .set({ status: "onboarded", updatedAt: new Date() })
        .where(eq(ownerLeadsTable.id, lead.id));
    });

    await backfillVenuePricingDefaults();
    const slotResult = await regenerateVenueSlotsForNext14Days();

    res.json({
      venueId: v.id,
      venueName: v.name,
      activated: true,
      slotsGenerated: slotResult.slotsCreated,
      slotsErrors: slotResult.errors,
      ownerLinked: ownerUserId !== null,
      setupChecklist,
    });
  } catch (err) {
    req.log.error({ err }, "Error in go-live");
    res.status(500).json({ error: "internal_error", message: "Failed to go live" });
  }
});

export default router;
