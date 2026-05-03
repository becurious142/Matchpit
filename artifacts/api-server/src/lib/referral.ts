import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "./logger";

function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const [profile] = await db
    .select({ referralCode: profilesTable.referralCode })
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  if (profile?.referralCode) return profile.referralCode;

  let code = generateReferralCode();
  let attempts = 0;

  while (attempts < 10) {
    const [existing] = await db
      .select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.referralCode, code))
      .limit(1);

    if (!existing) break;
    code = generateReferralCode();
    attempts++;
  }

  await db
    .update(profilesTable)
    .set({ referralCode: code, updatedAt: new Date() })
    .where(eq(profilesTable.id, userId));

  logger.info({ userId, code }, "Referral code generated");
  return code;
}

export async function attributeReferral(
  newUserId: string,
  referralCode: string,
): Promise<boolean> {
  const [profile] = await db
    .select({ referredBy: profilesTable.referredBy, id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.id, newUserId))
    .limit(1);

  if (!profile || profile.referredBy) return false;

  const [referrer] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.referralCode, referralCode.toUpperCase()))
    .limit(1);

  if (!referrer || referrer.id === newUserId) return false;

  await db
    .update(profilesTable)
    .set({ referredBy: referralCode.toUpperCase(), updatedAt: new Date() })
    .where(eq(profilesTable.id, newUserId));

  logger.info({ newUserId, referralCode }, "Referral attributed");
  return true;
}
