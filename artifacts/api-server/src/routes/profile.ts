import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { profilesTable, userStatsTable, playerFollowsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
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
    onboardingComplete: p.onboardingComplete,
    preferredAreas: p.preferredAreas ?? [],
    primarySkillLevel: p.primarySkillLevel ?? null,
    strikePoints: p.strikePoints,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Extract email and full name from Clerk session claims.
 *
 * Clerk's JWT session token does NOT include `email` by default —
 * you must add it via "Customize session token" in the Clerk dashboard.
 * For Google OAuth users this means the claims are often empty.
 *
 * Strategy:
 * 1. Try well-known claim keys (works if session token is customized).
 * 2. Fall back to the Clerk Backend API (guaranteed, one extra network hop).
 */
async function extractEmailAndName(
  userId: string,
  clerkUser: Record<string, unknown> | null | undefined
): Promise<{ email: string; fullName: string }> {
  // Try session claims first (fastest, no network request)
  const claimsEmail =
    (clerkUser?.email as string) ||
    (clerkUser?.primaryEmail as string) ||
    ((clerkUser?.email_addresses as { email_address: string }[])?.[0]?.email_address) ||
    "";

  const claimsName =
    (clerkUser?.name as string) ||
    (clerkUser?.fullName as string) ||
    (clerkUser?.full_name as string) ||
    [clerkUser?.first_name, clerkUser?.last_name].filter(Boolean).join(" ") ||
    "";

  if (claimsEmail) {
    return { email: claimsEmail, fullName: claimsName || "Player" };
  }

  // Fallback: fetch from Clerk Backend API (needed when email is not in JWT claims)
  try {
    const { createClerkClient } = await import("@clerk/backend");
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUserData = await clerkClient.users.getUser(userId);
    const email = clerkUserData.emailAddresses?.[0]?.emailAddress ?? "";
    const fullName =
      [clerkUserData.firstName, clerkUserData.lastName].filter(Boolean).join(" ") ||
      clerkUserData.username ||
      "Player";
    return { email, fullName };
  } catch {
    return { email: "", fullName: claimsName || "Player" };
  }
}

router.get("/profile/me", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const clerkUser = (req as any).auth?.sessionClaims as Record<string, unknown> | undefined;

    const { email: rawEmail, fullName } = await extractEmailAndName(userId!, clerkUser);

    // Graceful fallback: if Clerk Backend is unreachable (e.g. missing secret key
    // in local dev), use a deterministic placeholder so the profile row is always
    // created. The real email can be backfilled once Clerk is reachable.
    const email = rawEmail || `clerk:${userId}@noemail.local`;
    if (!rawEmail) {
      req.log.warn({ userId }, "Could not retrieve email from Clerk — using placeholder");
    }

    const profile = await getOrCreateProfile(userId!, email, fullName || "Player");

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
    req.log.debug({ userId }, "Profile update request");

    // Handle Vercel serverless body parsing issue — req.body may be undefined
    // if the JSON middleware hasn't consumed the stream yet, so we fall back
    // to reading the raw request body and parsing it ourselves.
    let body = req.body;
    if (!body || typeof body !== "object") {
      try {
        const raw = await new Promise<string>((resolve, reject) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => resolve(data));
          req.on("error", reject);
        });
        body = raw ? JSON.parse(raw) : {};
      } catch {
        req.log.warn({ userId }, "Request body missing or invalid — treating as empty update");
        body = {};
      }
    }

    const { fullName, phone, city, favoriteSports, avatarUrl, preferredAreas, primarySkillLevel, onboardingComplete } = body;

    const existing = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, userId!))
      .limit(1);

    if (!existing.length) {
      req.log.warn({ userId }, "Profile not found for update");
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
    if (preferredAreas !== undefined) updateData.preferredAreas = preferredAreas;
    if (primarySkillLevel !== undefined) updateData.primarySkillLevel = primarySkillLevel;
    if (onboardingComplete !== undefined) updateData.onboardingComplete = onboardingComplete;

    req.log.debug({ userId, updateData }, "Updating profile");

    const [updated] = await db
      .update(profilesTable)
      .set(updateData)
      .where(eq(profilesTable.clerkId, userId!))
      .returning();

    req.log.debug({ userId, profileId: updated.id }, "Profile updated successfully");
    res.json(formatProfile(updated));
  } catch (err) {
    req.log.error({ err, userId: getAuth(req).userId }, "Error updating profile");
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

// ─── Follow / Unfollow ───────────────────────────────────────────────────────
router.post("/profile/:id/follow", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const followingId = req.params.id as string;
    if (followingId === profile.id) {
      res.status(400).json({ error: "self_follow", message: "Cannot follow yourself" });
      return;
    }

    const [target] = await db.select({ id: profilesTable.id })
      .from(profilesTable).where(eq(profilesTable.id, followingId)).limit(1);
    if (!target) { res.status(404).json({ error: "not_found", message: "Player not found" }); return; }

    const [existing] = await db.select({ id: playerFollowsTable.id })
      .from(playerFollowsTable)
      .where(and(eq(playerFollowsTable.followerUserId, profile.id), eq(playerFollowsTable.followingUserId, followingId)))
      .limit(1);

    if (existing) { res.json({ followed: true, alreadyFollowing: true }); return; }

    await db.insert(playerFollowsTable).values({ followerUserId: profile.id, followingUserId: followingId });
    res.json({ followed: true });
  } catch (err) {
    req.log.error({ err }, "Error following player");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/profile/:id/unfollow", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const followingId = req.params.id as string;
    await db.delete(playerFollowsTable)
      .where(and(eq(playerFollowsTable.followerUserId, profile.id), eq(playerFollowsTable.followingUserId, followingId)));

    res.json({ unfollowed: true });
  } catch (err) {
    req.log.error({ err }, "Error unfollowing player");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/profile/:id/network", async (req, res) => {
  try {
    const targetId = req.params.id as string;

    const [followers] = await db.select({ c: count() }).from(playerFollowsTable)
      .where(eq(playerFollowsTable.followingUserId, targetId));
    const [following] = await db.select({ c: count() }).from(playerFollowsTable)
      .where(eq(playerFollowsTable.followerUserId, targetId));

    res.json({
      followersCount: Number(followers.c),
      followingCount: Number(following.c),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching network");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;