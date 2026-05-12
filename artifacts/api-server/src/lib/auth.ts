import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { userId } = getAuth(req);
  req.log.debug({ userId, headers: req.headers.authorization }, "Auth check");
  
  if (!userId) {
    req.log.warn({ headers: req.headers.authorization }, "Authentication failed - no userId");
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
  }

  // Auto-seed profile for new users on any authenticated route.
  // This prevents race conditions where the frontend calls /notifications, /dashboard etc.
  // before /profile/me has had a chance to create the profile row.
  try {
    const existing = await getProfileByClerkId(userId);
    if (!existing) {
      // Profile doesn't exist yet — fetch user info from Clerk and create it.
      // We do this lazily here so every authenticated endpoint is safe.
      try {
        const { createClerkClient } = await import("@clerk/backend");
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
        const fullName =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          clerkUser.username ||
          "Player";
        if (email) {
          const profile = await getOrCreateProfile(userId, email, fullName);
          (req as any).userProfile = profile;
        } else {
          // Create profile with placeholder email if Clerk doesn't have one
          const profile = await getOrCreateProfile(userId, `clerk:${userId}@noemail.local`, "Player");
          (req as any).userProfile = profile;
        }
      } catch (clerkError) {
        // If Clerk lookup fails, create a placeholder profile to prevent 500 errors
        req.log.warn({ userId, clerkError }, "Clerk API lookup failed, creating placeholder profile");
        const profile = await getOrCreateProfile(userId, `clerk:${userId}@noemail.local`, "Player");
        (req as any).userProfile = profile;
      }
    } else {
      (req as any).userProfile = existing;
    }
  } catch (dbError) {
    // DB error — create minimal profile to prevent blocking
    req.log.error({ userId, dbError }, "Database error in requireAuth");
    try {
      const profile = await getOrCreateProfile(userId, `clerk:${userId}@noemail.local`, "Player");
      (req as any).userProfile = profile;
    } catch {
      // If even that fails, continue without profile
    }
  }

  next();
}

function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function getOrCreateProfile(clerkId: string, email: string, fullName: string) {
  const existing = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    const profile = existing[0];
    // Backfill referral code if missing
    if (!profile.referralCode) {
      let code = generateReferralCode();
      let attempts = 0;
      while (attempts < 10) {
        const [dup] = await db
          .select({ id: profilesTable.id })
          .from(profilesTable)
          .where(eq(profilesTable.referralCode, code))
          .limit(1);
        if (!dup) break;
        code = generateReferralCode();
        attempts++;
      }
      const [updated] = await db
        .update(profilesTable)
        .set({ referralCode: code, updatedAt: new Date() })
        .where(eq(profilesTable.id, profile.id))
        .returning();
      return updated;
    }
    return profile;
  }

  // Generate unique referral code for new user
  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 10) {
    const [dup] = await db
      .select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.referralCode, code))
      .limit(1);
    if (!dup) break;
    code = generateReferralCode();
    attempts++;
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({ clerkId, email, fullName, referralCode: code })
    .returning();

  return profile;
}

export async function getProfileByClerkId(clerkId: string) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, clerkId))
    .limit(1);
  return profile ?? null;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
  }
  const profile = await getProfileByClerkId(userId);
  if (!profile) {
    res.status(401).json({ error: "unauthorized", message: "Profile not found" });
    return;
  }
  if (!profile.isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Admin access required" });
    return;
  }
  // Attach profile to request for downstream use
  (req as any).adminProfile = profile;
  next();
}
