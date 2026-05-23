import { db, referralsTable, profilesTable, financialLedgerTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { logger } from "../../lib/logger";
import { emitUserEvent } from "../../events/user-events";
import { randomUUID } from "crypto";

export class ReferralService {
  /**
   * Generates a unique 6-character referral code for a user.
   */
  static async generateReferralCode(userId: string): Promise<string> {
    const code = randomBytes(3).toString("hex").toUpperCase(); // e.g. 4A2F8D
    
    // In a real implementation we would retry on collision, 
    // but a 6-char hex code has enough entropy for initial scale.
    // Store it in the user's profile or metadata.
    await db
      .update(profilesTable)
      .set({ metadata: sql`jsonb_set(metadata, '{referralCode}', ${JSON.stringify(code)}::jsonb)` })
      .where(eq(profilesTable.id, userId));
      
    return code;
  }

  /**
   * Applies a referral code when a new user signs up.
   */
  static async applyReferralCode(newUserId: string, code: string, deviceFingerprint: string, ipHash: string) {
    // 1. Find the referrer by code
    const [referrer] = await db.execute(sql`
      SELECT id FROM ${profilesTable}
      WHERE metadata->>'referralCode' = ${code}
      LIMIT 1
    `);

    if (!referrer) {
      throw new Error("Invalid referral code");
    }

    if (referrer.id === newUserId) {
      throw new Error("Cannot refer yourself");
    }

    // 2. Fraud Checks (Device + IP)
    let abuseScore = 0;
    const fraudContext: any = { deviceFingerprint, ipHash };
    
    // Extremely basic device fingerprint collision check
    const [deviceMatch] = await db.execute(sql`
      SELECT id FROM ${referralsTable}
      WHERE metadata->'fraudContext'->>'deviceFingerprint' = ${deviceFingerprint}
      LIMIT 1
    `);
    
    if (deviceMatch) {
      abuseScore += 50;
      fraudContext.flags = ["device_overlap"];
    }

    // 3. Create the pending referral
    await db.insert(referralsTable).values({
      referrerUserId: String(referrer.id),
      referredUserId: newUserId,
      referralCode: code,
      status: abuseScore >= 50 ? "pending_review" : "pending",
      metadata: fraudContext,
      abuseScore: String(abuseScore),
      isFlagged: abuseScore >= 50,
      rewardAmount: "100.00",
      inviteeRewardAmount: "50.00",
    });

    logger.info({ newUserId, referrerId: referrer.id }, "Referral code applied");
  }

  /**
   * Unlocks the referral rewards AFTER the first completed booking.
   * This is triggered via a BullMQ worker listening to booking.completed.
   */
  static async processReferralUnlock(userId: string, bookingId: string, bookingAmount: number) {
    // Phase 17 Constraint: minimum booking amount
    if (bookingAmount < 200) {
      logger.info({ userId, bookingAmount }, "Booking amount too low for referral unlock.");
      return;
    }

    const [referral] = await db
      .select()
      .from(referralsTable)
      .where(and(
        eq(referralsTable.referredUserId, userId),
        eq(referralsTable.status, "pending")
      ));

    if (!referral) return; // No pending referral found

    // Update status to qualified and credit the rewards
    await db.transaction(async (tx) => {
      // 1. Mark as credited
      await tx
        .update(referralsTable)
        .set({ status: "credited", creditedAt: new Date() })
        .where(eq(referralsTable.id, referral.id));

      // 2. Issue reward to Referrer (Wallet Credit via Ledger)
      const referrerLedgerId = randomUUID();
      await tx.insert(financialLedgerTable).values({
        id: referrerLedgerId,
        profileId: referral.referrerUserId,
        type: "user_wallet",
        amount: referral.rewardAmount,
        currency: "INR",
        transactionType: "deposit",
        description: "Referral Reward (Referrer)",
        metadata: { referralId: referral.id, tag: "reward_credit" }
      });

      // 3. Issue reward to Invitee (Wallet Credit via Ledger)
      const inviteeLedgerId = randomUUID();
      await tx.insert(financialLedgerTable).values({
        id: inviteeLedgerId,
        profileId: referral.referredUserId,
        type: "user_wallet",
        amount: referral.inviteeRewardAmount,
        currency: "INR",
        transactionType: "deposit",
        description: "Referral Reward (Invitee)",
        metadata: { referralId: referral.id, tag: "reward_credit" }
      });
      
      // Update the derived wallet balances on the profiles
      await tx.execute(sql`
        UPDATE ${profilesTable} SET wallet_balance = wallet_balance + ${referral.rewardAmount}
        WHERE id = ${referral.referrerUserId}
      `);
      
      await tx.execute(sql`
        UPDATE ${profilesTable} SET wallet_balance = wallet_balance + ${referral.inviteeRewardAmount}
        WHERE id = ${referral.referredUserId}
      `);
    });

    // Fire events for notifications
    emitUserEvent("referral.unlocked", { 
      referrerId: referral.referrerUserId, 
      inviteeId: referral.referredUserId 
    });
    
    logger.info({ referralId: referral.id }, "Referral rewards distributed via ledger.");
  }
}
