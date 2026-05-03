import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { profilesTable, userStatsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getOrCreateProfile, getProfileByClerkId } from "../lib/auth";
import { processSignupBonus } from "../lib/wallet";
import { attributeReferral } from "../lib/referral";
import { computeAndAwardBadges, getUserBadges } from "../lib/badges";
import { getUserStats } from "../lib/trust";

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
    walletAutoUse: p.walletAutoUse,
    badgeCount: p.badgeCount,
    trustScore: Number(p.trustScore),
    isAdmin: p.isAdmin,
    isSuspended: p.isSuspended,
    referralCode: p.referralCode ?? null,
    referredBy: p.referredBy ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/profile/me", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const clerkUser = (req as any).auth?.sessionClaims;
    const email = clerkUser?.email ?? clerkUser?.primaryEmail ?? "";
    const fullName = clerkUser?.name ?? clerkUser?.fullName ?? "Player";

    const profile = await getOrCreateProfile(userId!, email, fullName);

    // Fire signup bonus for new users (idempotent)
    await processSignupBonus(profile.id).catch(() => null);

    // Compute badges in background (idempotent)
    computeAndAwardBadges(profile.id).catch(() => null);

    // Re-fetch to get updated balance
    const [fresh] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, profile.id))
      .limit(1);

    res.json(formatProfile(fresh));
  } catch (err) {
    req.log.error({ err }, "Error fetching profile");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch profile" });
  }
});

router.put("/profile/me", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fullName, phone, city, favoriteSports, avatarUrl } = req.body;

    const existing = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, userId!))
      .limit(1);

    if (!existing.length) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const updateData: Partial<typeof profilesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;
    if (city !== undefined) updateData.city = city;
    if (favoriteSports !== undefined) updateData.favoriteSports = favoriteSports;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const [updated] = await db
      .update(profilesTable)
      .set(updateData)
      .where(eq(profilesTable.clerkId, userId!))
      .returning();

    res.json(formatProfile(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating profile");
    res.status(500).json({ error: "internal_error", message: "Failed to update profile" });
  }
});

router.patch("/profile/wallet-auto-use", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { walletAutoUse } = req.body as { walletAutoUse: boolean };

    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, userId!))
      .limit(1);

    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const [updated] = await db
      .update(profilesTable)
      .set({ walletAutoUse: !!walletAutoUse, updatedAt: new Date() })
      .where(eq(profilesTable.id, profile.id))
      .returning();

    res.json({ walletAutoUse: updated.walletAutoUse });
  } catch (err) {
    req.log.error({ err }, "Error toggling wallet auto-use");
    res.status(500).json({ error: "internal_error", message: "Failed to update wallet auto-use" });
  }
});

router.post("/profile/referral", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, userId!))
      .limit(1);

    if (!profile.length) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { referralCode } = req.body as { referralCode: string };
    if (!referralCode) {
      res.status(400).json({ error: "validation_error", message: "referralCode required" });
      return;
    }

    const attributed = await attributeReferral(profile[0].id, referralCode);
    if (!attributed) {
      res.status(409).json({ error: "referral_invalid", message: "Invalid or already applied referral code" });
      return;
    }

    res.json({ success: true, message: "Referral code applied" });
  } catch (err) {
    req.log.error({ err }, "Error applying referral");
    res.status(500).json({ error: "internal_error", message: "Failed to apply referral" });
  }
});

router.get("/profile/badges", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, userId!))
      .limit(1);

    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const badges = await getUserBadges(profile.id);
    res.json(badges.map((b) => ({
      id: b.id,
      slug: b.slug,
      label: b.label,
      description: b.description,
      icon: b.icon,
      earnedAt: b.earnedAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching badges");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch badges" });
  }
});

router.get("/profile/stats", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }
    const stats = await getUserStats(profile.id);
    res.json({ ...stats, trustScore: Number(profile.trustScore) });
  } catch (err) {
    req.log.error({ err }, "Error fetching player stats");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch stats" });
  }
});

export default router;
