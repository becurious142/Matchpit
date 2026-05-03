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
  if (!userId) {
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
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
