import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export async function getOrCreateProfile(clerkId: string, email: string, fullName: string) {
  const existing = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({ clerkId, email, fullName })
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
