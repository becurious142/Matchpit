import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { venuesTable, slotsTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, sql, or } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";

const router: IRouter = Router();

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

function formatVenueDetail(v: typeof venuesTable.$inferSelect, upcomingMatches = 0) {
  return {
    ...formatVenue(v),
    images: v.images ?? [],
    description: v.description ?? null,
    openTime: v.openTime,
    closeTime: v.closeTime,
    contactPhone: v.contactPhone ?? null,
    ownerName: v.ownerName ?? null,
    upcomingMatches,
  };
}

router.get("/venues", async (req, res) => {
  try {
    const { city, sport, search, page = "1", limit = "12" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(venuesTable.isApproved, true)];
    if (city) conditions.push(eq(venuesTable.city, city));
    if (search) conditions.push(ilike(venuesTable.name, `%${search}%`));

    let query = db.select().from(venuesTable).where(and(...conditions));

    const all = await query;
    const filtered = sport
      ? all.filter((v) => v.sports.includes(sport))
      : all;

    const total = filtered.length;
    const venues = filtered.slice(offset, offset + limitNum).map(formatVenue);

    res.json({
      venues,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    req.log.error({ err }, "Error listing venues");
    res.status(500).json({ error: "internal_error", message: "Failed to list venues" });
  }
});

router.get("/venues/featured", async (_req, res) => {
  try {
    const venues = await db
      .select()
      .from(venuesTable)
      .where(and(eq(venuesTable.isApproved, true), eq(venuesTable.isFeatured, true)))
      .limit(6);
    res.json(venues.map(formatVenue));
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: "Failed to fetch featured venues" });
  }
});

router.get("/venues/sports", async (_req, res) => {
  try {
    const venues = await db.select({ sports: venuesTable.sports }).from(venuesTable).where(eq(venuesTable.isApproved, true));
    const sportCounts: Record<string, number> = {};
    for (const v of venues) {
      for (const s of v.sports ?? []) {
        sportCounts[s] = (sportCounts[s] ?? 0) + 1;
      }
    }
    const sportMeta: Record<string, { label: string; icon: string }> = {
      football: { label: "Football", icon: "⚽" },
      cricket: { label: "Cricket", icon: "🏏" },
      badminton: { label: "Badminton", icon: "🏸" },
      tennis: { label: "Tennis", icon: "🎾" },
      basketball: { label: "Basketball", icon: "🏀" },
      volleyball: { label: "Volleyball", icon: "🏐" },
      hockey: { label: "Hockey", icon: "🏑" },
    };
    const result = Object.entries(sportCounts).map(([slug, count]) => ({
      slug,
      label: sportMeta[slug]?.label ?? slug,
      icon: sportMeta[slug]?.icon ?? "🏆",
      venueCount: count,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "internal_error", message: "Failed to list sports" });
  }
});

router.get("/venues/:venueId", async (req, res) => {
  try {
    const venueId = req.params.venueId as string;
    const [venue] = await db
      .select()
      .from(venuesTable)
      .where(eq(venuesTable.id, venueId))
      .limit(1);

    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    res.json(formatVenueDetail(venue));
  } catch (err) {
    req.log.error({ err }, "Error fetching venue");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch venue" });
  }
});

router.get("/venues/:venueId/slots", async (req, res) => {
  try {
    const venueId = req.params.venueId as string;
    const today = new Date();
    const fromDate = req.query.from
      ? parseISO(req.query.from as string)
      : today;
    const toDate = req.query.to
      ? parseISO(req.query.to as string)
      : addDays(today, 13);

    const fromStr = format(fromDate, "yyyy-MM-dd");
    const toStr = format(toDate, "yyyy-MM-dd");

    const slots = await db
      .select()
      .from(slotsTable)
      .where(
        and(
          eq(slotsTable.venueId, venueId),
          gte(slotsTable.date, fromStr),
          lte(slotsTable.date, toStr),
        ),
      )
      .orderBy(slotsTable.date, slotsTable.startTime);

    // Group by date
    const grouped: Record<string, typeof slots> = {};
    for (const slot of slots) {
      const dateKey = slot.date;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(slot);
    }

    const result = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, daySlots]) => ({
        date,
        slots: daySlots.map((s) => ({
          id: s.id,
          venueId: s.venueId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          priceOverride: s.priceOverride ? Number(s.priceOverride) : null,
          status: s.status,
          sport: s.sport ?? null,
        })),
      }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error fetching venue slots");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch slots" });
  }
});

export default router;
