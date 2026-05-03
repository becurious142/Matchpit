import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getOrCreateProfile } from "../lib/auth";

const router: IRouter = Router();

router.get("/profile/me", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const clerkUser = (req as any).auth?.sessionClaims;
    const email = clerkUser?.email ?? clerkUser?.primaryEmail ?? "";
    const fullName = clerkUser?.name ?? clerkUser?.fullName ?? "Player";

    const profile = await getOrCreateProfile(userId!, email, fullName);

    res.json({
      id: profile.id,
      clerkId: profile.clerkId,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone ?? null,
      city: profile.city ?? null,
      favoriteSports: profile.favoriteSports ?? [],
      avatarUrl: profile.avatarUrl ?? null,
      walletBalance: Number(profile.walletBalance),
      badgeCount: profile.badgeCount,
      trustScore: Number(profile.trustScore),
      isAdmin: profile.isAdmin,
      createdAt: profile.createdAt.toISOString(),
    });
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

    res.json({
      id: updated.id,
      clerkId: updated.clerkId,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone ?? null,
      city: updated.city ?? null,
      favoriteSports: updated.favoriteSports ?? [],
      avatarUrl: updated.avatarUrl ?? null,
      walletBalance: Number(updated.walletBalance),
      badgeCount: updated.badgeCount,
      trustScore: Number(updated.trustScore),
      isAdmin: updated.isAdmin,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating profile");
    res.status(500).json({ error: "internal_error", message: "Failed to update profile" });
  }
});

export default router;
