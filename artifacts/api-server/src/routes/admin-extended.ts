import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  citiesTable,
  couponsTable,
  venuePayoutLedgerTable,
  venuesTable,
  profilesTable,
  paymentsTable,
  walletLedgerTable,
  ownerLeadsTable,
  bookingsTable,
} from "@workspace/db";
import { eq, desc, asc, sum, count, and, inArray } from "drizzle-orm";
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

// ─── City Controls ────────────────────────────────────────────────────────────

router.get("/admin/cities", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const cities = await db
      .select()
      .from(citiesTable)
      .orderBy(asc(citiesTable.launchPriority));

    res.json(
      cities.map((c) => ({
        id: c.id,
        cityName: c.cityName,
        slug: c.slug,
        isActive: c.isActive,
        launchPriority: c.launchPriority,
        createdAt: c.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing cities");
    res.status(500).json({ error: "internal_error", message: "Failed to list cities" });
  }
});

router.post("/admin/cities", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { cityName, slug, isActive, launchPriority } = req.body as {
      cityName: string;
      slug: string;
      isActive?: boolean;
      launchPriority?: number;
    };

    if (!cityName || !slug) {
      res.status(400).json({ error: "validation_error", message: "cityName and slug required" });
      return;
    }

    const [city] = await db
      .insert(citiesTable)
      .values({
        cityName,
        slug: slug.toLowerCase(),
        isActive: isActive ?? false,
        launchPriority: launchPriority ?? 99,
      })
      .returning();

    res.status(201).json({
      id: city.id,
      cityName: city.cityName,
      slug: city.slug,
      isActive: city.isActive,
      launchPriority: city.launchPriority,
      createdAt: city.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating city");
    res.status(500).json({ error: "internal_error", message: "Failed to create city" });
  }
});

router.patch("/admin/cities/:cityId", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const cityId = req.params.cityId as string;
    const updates = req.body as {
      isActive?: boolean;
      launchPriority?: number;
      cityName?: string;
    };

    const [updated] = await db
      .update(citiesTable)
      .set({ ...updates })
      .where(eq(citiesTable.id, cityId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "City not found" });
      return;
    }

    res.json({
      id: updated.id,
      cityName: updated.cityName,
      slug: updated.slug,
      isActive: updated.isActive,
      launchPriority: updated.launchPriority,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating city");
    res.status(500).json({ error: "internal_error", message: "Failed to update city" });
  }
});

// ─── Finance Dashboard ────────────────────────────────────────────────────────

router.get("/admin/finance", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [gmv, payoutPending, payoutPaid, payoutTotal] = await Promise.all([
      db
        .select({ total: sum(paymentsTable.amount) })
        .from(paymentsTable)
        .where(eq(paymentsTable.status, "success")),
      db
        .select({ total: sum(venuePayoutLedgerTable.venuePayable) })
        .from(venuePayoutLedgerTable)
        .where(eq(venuePayoutLedgerTable.status, "pending")),
      db
        .select({ total: sum(venuePayoutLedgerTable.venuePayable) })
        .from(venuePayoutLedgerTable)
        .where(eq(venuePayoutLedgerTable.status, "paid")),
      db
        .select({ total: sum(venuePayoutLedgerTable.platformCommission) })
        .from(venuePayoutLedgerTable),
    ]);

    const totalGmv = Number(gmv[0]?.total ?? 0);
    const pendingPayouts = Number(payoutPending[0]?.total ?? 0);
    const paidPayouts = Number(payoutPaid[0]?.total ?? 0);
    const commissionEarned = Number(payoutTotal[0]?.total ?? 0);

    res.json({
      totalGmv,
      commissionEarned,
      pendingVenuePayouts: pendingPayouts,
      paidVenuePayouts: paidPayouts,
      platformNetRevenue: totalGmv - pendingPayouts - paidPayouts,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching finance data");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch finance data" });
  }
});

// ─── Venue Payouts ────────────────────────────────────────────────────────────

router.get("/admin/payouts", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .orderBy(desc(venuePayoutLedgerTable.createdAt))
      .limit(100);

    if (!payouts.length) {
      res.json([]);
      return;
    }

    const venueIds = [...new Set(payouts.map((p) => p.venueId))];
    const venues = await db
      .select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city })
      .from(venuesTable)
      .where(inArray(venuesTable.id, venueIds));
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    res.json(
      payouts.map((p) => {
        const v = venueMap.get(p.venueId);
        return {
          id: p.id,
          venueId: p.venueId,
          venueName: v?.name ?? "Unknown",
          venueCity: v?.city ?? "",
          referenceId: p.referenceId ?? null,
          referenceType: p.referenceType,
          grossAmount: Number(p.grossAmount),
          razorpayFee: Number(p.razorpayFee),
          platformCommission: Number(p.platformCommission),
          venuePayable: Number(p.venuePayable),
          status: p.status,
          paidAt: p.paidAt?.toISOString() ?? null,
          notes: p.notes ?? null,
          createdAt: p.createdAt.toISOString(),
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing payouts");
    res.status(500).json({ error: "internal_error", message: "Failed to list payouts" });
  }
});

router.patch("/admin/payouts/:payoutId/status", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const payoutId = req.params.payoutId as string;
    const { status, notes } = req.body as {
      status: "pending" | "paid" | "hold";
      notes?: string;
    };

    const setFields: Record<string, unknown> = { status };
    if (notes !== undefined) setFields.notes = notes;
    if (status === "paid") setFields.paidAt = new Date();

    const [updated] = await db
      .update(venuePayoutLedgerTable)
      .set(setFields)
      .where(eq(venuePayoutLedgerTable.id, payoutId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Payout record not found" });
      return;
    }

    res.json({
      id: updated.id,
      venueId: updated.venueId,
      referenceType: updated.referenceType,
      venuePayable: Number(updated.venuePayable),
      status: updated.status,
      paidAt: updated.paidAt?.toISOString() ?? null,
      notes: updated.notes ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating payout status");
    res.status(500).json({ error: "internal_error", message: "Failed to update payout" });
  }
});

// ─── Coupon Management ────────────────────────────────────────────────────────

router.get("/admin/coupons", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const coupons = await db
      .select()
      .from(couponsTable)
      .orderBy(desc(couponsTable.createdAt));

    res.json(
      coupons.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: Number(c.value),
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount,
        minAmount: c.minAmount ? Number(c.minAmount) : null,
        firstBookingOnly: c.firstBookingOnly,
        citySlug: c.citySlug ?? null,
        sport: c.sport ?? null,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        isActive: c.isActive,
        createdAt: c.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing coupons");
    res.status(500).json({ error: "internal_error", message: "Failed to list coupons" });
  }
});

router.post("/admin/coupons", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const {
      code,
      type,
      value,
      maxUses,
      minAmount,
      firstBookingOnly,
      citySlug,
      sport,
      expiresAt,
    } = req.body as {
      code: string;
      type: "flat" | "percent";
      value: number;
      maxUses?: number;
      minAmount?: number;
      firstBookingOnly?: boolean;
      citySlug?: string;
      sport?: string;
      expiresAt?: string;
    };

    if (!code || !type || value === undefined) {
      res.status(400).json({ error: "validation_error", message: "code, type, and value are required" });
      return;
    }

    const [coupon] = await db
      .insert(couponsTable)
      .values({
        code: code.toUpperCase().trim(),
        type,
        value: String(value),
        maxUses: maxUses ?? null,
        minAmount: minAmount ? String(minAmount) : null,
        firstBookingOnly: firstBookingOnly ?? false,
        citySlug: citySlug ?? null,
        sport: sport ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      })
      .returning();

    res.status(201).json({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      usedCount: coupon.usedCount,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt.toISOString(),
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "duplicate", message: "Coupon code already exists" });
      return;
    }
    req.log.error({ err }, "Error creating coupon");
    res.status(500).json({ error: "internal_error", message: "Failed to create coupon" });
  }
});

router.patch("/admin/coupons/:couponId", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const couponId = req.params.couponId as string;
    const { isActive, maxUses, expiresAt } = req.body as {
      isActive?: boolean;
      maxUses?: number | null;
      expiresAt?: string | null;
    };

    const setFields: Record<string, unknown> = {};
    if (isActive !== undefined) setFields.isActive = isActive;
    if (maxUses !== undefined) setFields.maxUses = maxUses;
    if (expiresAt !== undefined)
      setFields.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const [updated] = await db
      .update(couponsTable)
      .set(setFields)
      .where(eq(couponsTable.id, couponId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Coupon not found" });
      return;
    }

    res.json({ id: updated.id, code: updated.code, isActive: updated.isActive });
  } catch (err) {
    req.log.error({ err }, "Error updating coupon");
    res.status(500).json({ error: "internal_error", message: "Failed to update coupon" });
  }
});

// ─── Wallet Adjustment ────────────────────────────────────────────────────────

router.post("/admin/wallet/adjust", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { userId, type, amount, reason } = req.body as {
      userId: string;
      type: "credit" | "debit";
      amount: number;
      reason: string;
    };

    if (!userId || !type || !amount || !reason) {
      res.status(400).json({ error: "validation_error", message: "userId, type, amount, reason are required" });
      return;
    }

    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1);

    if (!profile) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }

    const currentBalance = Number(profile.walletBalance);
    const delta = type === "credit" ? amount : -amount;
    const newBalance = Math.max(0, currentBalance + delta);

    await db.transaction(async (tx) => {
      await tx
        .update(profilesTable)
        .set({ walletBalance: String(newBalance) })
        .where(eq(profilesTable.id, userId));

      await tx.insert(walletLedgerTable).values({
        userId,
        type,
        reason: `[Admin] ${reason}`,
        amount: String(amount),
        balanceAfter: String(newBalance),
      });
    });

    res.json({
      userId,
      previousBalance: currentBalance,
      newBalance,
      delta: type === "credit" ? amount : -amount,
    });
  } catch (err) {
    req.log.error({ err }, "Error adjusting wallet");
    res.status(500).json({ error: "internal_error", message: "Failed to adjust wallet" });
  }
});

// ─── Owner Lead CRM (extended) ────────────────────────────────────────────────

router.patch("/admin/owner-leads/:leadId/crm", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const leadId = req.params.leadId as string;
    const {
      status,
      contactedOn,
      followupDate,
      notes,
      assignedAdmin,
      expectedInventoryValue,
    } = req.body as {
      status?: string;
      contactedOn?: string;
      followupDate?: string;
      notes?: string;
      assignedAdmin?: string;
      expectedInventoryValue?: number;
    };

    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    if (status) setFields.status = status;
    if (contactedOn !== undefined) setFields.contactedOn = contactedOn ? new Date(contactedOn) : null;
    if (followupDate !== undefined) setFields.followupDate = followupDate ?? null;
    if (notes !== undefined) setFields.notes = notes;
    if (assignedAdmin !== undefined) setFields.assignedAdmin = assignedAdmin;
    if (expectedInventoryValue !== undefined)
      setFields.expectedInventoryValue = expectedInventoryValue ? String(expectedInventoryValue) : null;

    const [updated] = await db
      .update(ownerLeadsTable)
      .set(setFields)
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
      contactedOn: updated.contactedOn?.toISOString() ?? null,
      followupDate: updated.followupDate ?? null,
      notes: updated.notes ?? null,
      assignedAdmin: updated.assignedAdmin ?? null,
      expectedInventoryValue: updated.expectedInventoryValue
        ? Number(updated.expectedInventoryValue)
        : null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating lead CRM");
    res.status(500).json({ error: "internal_error", message: "Failed to update lead" });
  }
});

export default router;
