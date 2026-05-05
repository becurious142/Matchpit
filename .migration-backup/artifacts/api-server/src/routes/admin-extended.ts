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
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  referralConfigTable,
} from "@workspace/db";
import { eq, desc, asc, sum, count, and, inArray, ne } from "drizzle-orm";
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

// ─── Referral Config CRUD ─────────────────────────────────────────────────────

// Helper: convert key-value rows to a flat config object
function rowsToConfig(rows: { key: string; value: string; isActive: boolean; updatedAt: Date }[]) {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const lastUpdated = rows.reduce((latest, r) => r.updatedAt > latest ? r.updatedAt : latest, new Date(0));
  return {
    signupBonusAmount: Number(map["signup_bonus"] ?? 50),
    referrerRewardAmount: Number(map["referral_referrer"] ?? 100),
    refereeRewardAmount: Number(map["referral_referee"] ?? 50),
    firstBookingCashback: Number(map["first_booking_cashback"] ?? 75),
    firstMatchCashback: Number(map["first_match_cashback"] ?? 50),
    isActive: rows.every((r) => r.isActive),
    updatedAt: lastUpdated.toISOString(),
  };
}

router.get("/admin/referral-config", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    let rows = await db.select().from(referralConfigTable);
    if (!rows.length) {
      const { seedDefaultReferralConfig } = await import("../lib/wallet");
      await seedDefaultReferralConfig();
      rows = await db.select().from(referralConfigTable);
    }
    res.json(rowsToConfig(rows));
  } catch (err) {
    req.log.error({ err }, "Error fetching referral config");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch referral config" });
  }
});

router.patch("/admin/referral-config", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const {
      signupBonusAmount,
      referrerRewardAmount,
      refereeRewardAmount,
      firstBookingCashback,
      firstMatchCashback,
    } = req.body as Record<string, number | undefined>;

    // Ensure rows exist
    let rows = await db.select().from(referralConfigTable);
    if (!rows.length) {
      const { seedDefaultReferralConfig } = await import("../lib/wallet");
      await seedDefaultReferralConfig();
      rows = await db.select().from(referralConfigTable);
    }

    // Update each key individually
    const updates: Array<{ key: string; value: number }> = [
      { key: "signup_bonus", value: signupBonusAmount ?? -1 },
      { key: "referral_referrer", value: referrerRewardAmount ?? -1 },
      { key: "referral_referee", value: refereeRewardAmount ?? -1 },
      { key: "first_booking_cashback", value: firstBookingCashback ?? -1 },
      { key: "first_match_cashback", value: firstMatchCashback ?? -1 },
    ].filter((u) => u.value >= 0);

    for (const u of updates) {
      await db
        .update(referralConfigTable)
        .set({ value: String(u.value), updatedAt: new Date() })
        .where(eq(referralConfigTable.key, u.key));
    }

    const updated = await db.select().from(referralConfigTable);
    res.json(rowsToConfig(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating referral config");
    res.status(500).json({ error: "internal_error", message: "Failed to update referral config" });
  }
});

// ─── Match Finance Inspector ──────────────────────────────────────────────────

router.get("/admin/match-finance", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .orderBy(desc(hostedMatchesTable.createdAt))
      .limit(50);

    if (!matches.length) { res.json([]); return; }

    const matchIds = matches.map((m) => m.id);
    const participants = await db
      .select()
      .from(hostedMatchParticipantsTable)
      .where(inArray(hostedMatchParticipantsTable.matchId, matchIds));

    const venueIds = [...new Set(matches.map((m) => m.venueId))];
    const venues = await db
      .select({ id: venuesTable.id, name: venuesTable.name })
      .from(venuesTable)
      .where(inArray(venuesTable.id, venueIds));
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    const hostIds = [...new Set(matches.map((m) => m.hostUserId))];
    const hosts = await db
      .select({ id: profilesTable.id, fullName: profilesTable.fullName, email: profilesTable.email })
      .from(profilesTable)
      .where(inArray(profilesTable.id, hostIds));
    const hostMap = new Map(hosts.map((h) => [h.id, h]));

    res.json(
      matches.map((m) => {
        const matchParticipants = participants.filter((p) => p.matchId === m.id);
        const depositPaid = matchParticipants.filter((p) => ["reserved", "final_paid"].includes(p.status)).length;
        const finalPaid = matchParticipants.filter((p) => p.status === "final_paid").length;
        const depositRevenue = depositPaid * Number(m.reserveFee ?? 0);
        const finalRevenue = finalPaid * Number(m.finalFeePerPlayer ?? 0);
        return {
          id: m.id,
          title: `${m.sport} match`,
          sport: m.sport,
          status: m.status,
          matchDate: m.date,
          matchTime: m.startTime,
          venueName: venueMap.get(m.venueId)?.name ?? "Unknown",
          hostName: hostMap.get(m.hostUserId)?.fullName ?? "Unknown",
          hostEmail: hostMap.get(m.hostUserId)?.email ?? "",
          totalPlayers: m.totalPlayers,
          currentPlayers: m.currentPlayers,
          minPlayers: m.minPlayers,
          depositFee: Number(m.reserveFee ?? 0),
          finalFeePerPlayer: Number(m.finalFeePerPlayer ?? 0),
          depositRevenue,
          finalRevenue,
          totalRevenue: depositRevenue + finalRevenue,
          depositPaidCount: depositPaid,
          finalPaidCount: finalPaid,
          cancelledReason: m.cancelledReason ?? null,
          underfillRefundIssued: m.underfillRefundIssued,
          lockDeadline: m.lockDeadline?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching match finance");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch match finance" });
  }
});

// ─── Cron Trigger Endpoints ───────────────────────────────────────────────────

router.post("/admin/cron/underfill", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { processUnderfillCancellations } = await import("../lib/match-cron");
    const result = await processUnderfillCancellations();
    res.json({ message: "Underfill cron completed", ...result });
  } catch (err) {
    req.log.error({ err }, "Error running underfill cron");
    res.status(500).json({ error: "internal_error", message: "Failed to run underfill cron" });
  }
});

router.post("/admin/cron/drop-unpaid", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { dropUnpaidParticipants } = await import("../lib/match-cron");
    const result = await dropUnpaidParticipants();
    res.json({ message: "Drop-unpaid cron completed", ...result });
  } catch (err) {
    req.log.error({ err }, "Error running drop-unpaid cron");
    res.status(500).json({ error: "internal_error", message: "Failed to run drop-unpaid cron" });
  }
});

// ─── User Badge Viewer (admin) ────────────────────────────────────────────────

router.get("/admin/users/:userId/badges", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { getUserBadges } = await import("../lib/badges");
    const badges = await getUserBadges(req.params.userId as string);
    res.json(badges);
  } catch (err) {
    req.log.error({ err }, "Error fetching user badges");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch badges" });
  }
});

// ─── Live Ops: Force Match Confirm ────────────────────────────────────────────

router.post("/admin/matches/:matchId/force-confirm", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const matchId = req.params.matchId as string;
    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }

    const [updated] = await db.update(hostedMatchesTable)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(hostedMatchesTable.id, matchId))
      .returning();

    const { notificationsTable } = await import("@workspace/db");
    const participants = await db.select({ userId: hostedMatchParticipantsTable.userId })
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, matchId));

    if (participants.length > 0) {
      await db.insert(notificationsTable).values(
        participants.map((p) => ({
          userId: p.userId,
          type: "match_confirmed" as const,
          title: "Match Confirmed",
          body: "Admin has confirmed your match. Final payment will be due soon.",
          referenceId: matchId,
        })),
      );
    }

    res.json({ matchId, status: updated.status, message: "Match force-confirmed by admin" });
  } catch (err) {
    req.log.error({ err }, "Error force-confirming match");
    res.status(500).json({ error: "internal_error", message: "Failed to force-confirm match" });
  }
});

// ─── Live Ops: Force Match Cancel ─────────────────────────────────────────────

router.post("/admin/matches/:matchId/force-cancel", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const matchId = req.params.matchId as string;
    const { reason } = req.body as { reason?: string };

    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }

    await db.update(hostedMatchesTable)
      .set({ status: "cancelled", cancelledReason: reason ?? "Cancelled by admin", updatedAt: new Date() })
      .where(eq(hostedMatchesTable.id, matchId));

    await db.update(hostedMatchParticipantsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(hostedMatchParticipantsTable.matchId, matchId),
        inArray(hostedMatchParticipantsTable.status, ["reserved", "final_paid"]),
      ));

    const { notificationsTable } = await import("@workspace/db");
    const participants = await db.select({ userId: hostedMatchParticipantsTable.userId })
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.matchId, matchId));

    if (participants.length > 0) {
      await db.insert(notificationsTable).values(
        participants.map((p) => ({
          userId: p.userId,
          type: "match_cancelled" as const,
          title: "Match Cancelled",
          body: reason ?? "This match has been cancelled by admin.",
          referenceId: matchId,
        })),
      );
    }

    res.json({ matchId, status: "cancelled", message: "Match force-cancelled by admin" });
  } catch (err) {
    req.log.error({ err }, "Error force-cancelling match");
    res.status(500).json({ error: "internal_error", message: "Failed to force-cancel match" });
  }
});

// ─── Live Ops: Resend Final Payment Request ────────────────────────────────────

router.post("/admin/matches/:matchId/resend-final-payment", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const matchId = req.params.matchId as string;
    const [match] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found", message: "Match not found" }); return; }

    const reserved = await db.select({ userId: hostedMatchParticipantsTable.userId })
      .from(hostedMatchParticipantsTable)
      .where(and(
        eq(hostedMatchParticipantsTable.matchId, matchId),
        eq(hostedMatchParticipantsTable.status, "reserved"),
      ));

    if (!reserved.length) {
      res.json({ notified: 0, message: "No reserved participants to notify" });
      return;
    }

    const { notificationsTable } = await import("@workspace/db");
    await db.insert(notificationsTable).values(
      reserved.map((p) => ({
        userId: p.userId,
        type: "final_payment_due" as const,
        title: "Final Payment Due",
        body: `Your match is confirmed. Please pay the final amount to secure your spot.`,
        referenceId: matchId,
      })),
    );

    res.json({ notified: reserved.length, message: "Final payment reminders sent" });
  } catch (err) {
    req.log.error({ err }, "Error resending final payment");
    res.status(500).json({ error: "internal_error", message: "Failed to resend final payment" });
  }
});

// ─── Live Ops: Suspend / Unsuspend User ───────────────────────────────────────

router.post("/admin/users/:userId/suspend", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const userId = req.params.userId as string;
    const { suspended } = req.body as { suspended: boolean };

    const [user] = await db.select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.id, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "not_found", message: "User not found" }); return; }
    if (userId === admin.id) { res.status(400).json({ error: "invalid", message: "Cannot suspend yourself" }); return; }

    const [updated] = await db.update(profilesTable)
      .set({ isSuspended: !!suspended, updatedAt: new Date() })
      .where(eq(profilesTable.id, userId))
      .returning({ id: profilesTable.id, isSuspended: profilesTable.isSuspended });

    res.json({ userId: updated.id, isSuspended: updated.isSuspended });
  } catch (err) {
    req.log.error({ err }, "Error suspending user");
    res.status(500).json({ error: "internal_error", message: "Failed to suspend user" });
  }
});

// ─── Live Ops: Set Venue Owner ─────────────────────────────────────────────────

router.patch("/admin/venues/:venueId/set-owner", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const venueId = req.params.venueId as string;
    const { ownerUserId } = req.body as { ownerUserId: string | null };

    const [venue] = await db.select({ id: venuesTable.id })
      .from(venuesTable)
      .where(eq(venuesTable.id, venueId))
      .limit(1);

    if (!venue) { res.status(404).json({ error: "not_found", message: "Venue not found" }); return; }

    const [updated] = await db.update(venuesTable)
      .set({ ownerUserId: ownerUserId ?? null, updatedAt: new Date() })
      .where(eq(venuesTable.id, venueId))
      .returning({ id: venuesTable.id, ownerUserId: venuesTable.ownerUserId });

    res.json({ venueId: updated.id, ownerUserId: updated.ownerUserId });
  } catch (err) {
    req.log.error({ err }, "Error setting venue owner");
    res.status(500).json({ error: "internal_error", message: "Failed to set venue owner" });
  }
});

// ─── Live Ops: All Matches (live list) ────────────────────────────────────────

router.get("/admin/live-matches", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const matches = await db.select().from(hostedMatchesTable)
      .orderBy(desc(hostedMatchesTable.createdAt))
      .limit(100);

    const participantCounts = await db.select({
      matchId: hostedMatchParticipantsTable.matchId,
      total: count(),
    })
      .from(hostedMatchParticipantsTable)
      .groupBy(hostedMatchParticipantsTable.matchId);

    const countByMatch = new Map(participantCounts.map((p) => [p.matchId, Number(p.total)]));

    res.json(matches.map((m) => ({
      id: m.id,
      sport: m.sport,
      date: m.date,
      startTime: m.startTime,
      endTime: m.endTime,
      status: m.status,
      currentPlayers: m.currentPlayers,
      totalPlayers: m.totalPlayers,
      minPlayers: m.minPlayers,
      reserveFee: Number(m.reserveFee ?? 0),
      finalFeePerPlayer: Number(m.finalFeePerPlayer ?? 0),
      participantCount: countByMatch.get(m.id) ?? 0,
      cancelledReason: m.cancelledReason ?? null,
      lockDeadline: m.lockDeadline?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching live matches");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch live matches" });
  }
});

// ─── Tester Invite Tools ─────────────────────────────────────────────────────
router.post("/admin/testers/add", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { phone, name, notes } = req.body;
    if (!phone?.trim() || !name?.trim()) {
      res.status(400).json({ error: "validation", message: "phone and name required" });
      return;
    }
    const { testInvitesTable } = await import("@workspace/db");
    const inviteCode = `MP${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [invite] = await db.insert(testInvitesTable).values({
      phone: phone.trim(),
      name: name.trim(),
      inviteCode,
      notes: notes?.trim() ?? null,
    }).returning();
    res.status(201).json(invite);
  } catch (err) {
    req.log.error({ err }, "Error adding tester invite");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/admin/testers", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { testInvitesTable } = await import("@workspace/db");
    const invites = await db.select().from(testInvitesTable)
      .orderBy(desc(testInvitesTable.createdAt)).limit(200);
    res.json(invites);
  } catch (err) {
    req.log.error({ err }, "Error fetching testers");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/admin/testers/:id/status", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const inviteId = req.params.id as string;
    const { status } = req.body;
    if (!["sent", "used", "expired"].includes(status)) {
      res.status(400).json({ error: "validation", message: "invalid status" });
      return;
    }
    const { testInvitesTable } = await import("@workspace/db");
    const [updated] = await db.update(testInvitesTable)
      .set({ status: status as any })
      .where(eq(testInvitesTable.id, inviteId))
      .returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating tester status");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Community Seed (admin only) ─────────────────────────────────────────────
router.post("/admin/seed/community", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { communityPostsTable, citiesTable } = await import("@workspace/db");
    const { eq: eqLocal } = await import("drizzle-orm");
    const [city] = await db.select({ id: citiesTable.id })
      .from(citiesTable).where(eqLocal(citiesTable.isActive, true)).limit(1);

    const seedPosts = [
      { type: "looking_players" as const, caption: "Looking for 2 more players for a Sunday football match at SMS Stadium arena! DM to join 🔥", sport: "football" },
      { type: "match_result" as const, caption: "Amazing box cricket session yesterday at Jaipur Sports Complex. Team A won by 15 runs — gg everyone! 🏏", sport: "box_cricket" },
      { type: "achievement" as const, caption: "Just hit 10 matches played on MATCHPIT! Jaipur's pitch is calling every weekend 💪", sport: null },
      { type: "venue_review" as const, caption: "Reviewed Pink City Turf — floodlights are excellent, turf is well-maintained. 5 stars for the facilities 📍", sport: "football" },
      { type: "challenge" as const, caption: "Calling out all football squads in Jaipur — we're the Panthers and we want a 7v7 challenge this Saturday! ⚡", sport: "football" },
    ];

    for (const p of seedPosts) {
      await db.insert(communityPostsTable).values({
        userId: admin.id,
        cityId: city?.id ?? null,
        type: p.type,
        caption: p.caption,
        sport: p.sport,
      });
    }

    res.json({ seeded: seedPosts.length });
  } catch (err) {
    req.log.error({ err }, "Error seeding community");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

