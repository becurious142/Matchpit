import {
  db,
  walletLedgerTable,
  profilesTable,
  rewardEventsTable,
  referralConfigTable,
  bookingsTable,
  hostedMatchesTable,
} from "@workspace/db";
import {
  HOST_MILESTONE_REWARDS,
  getAllMilestones,
  getMilestoneReward,
} from "./financial-config";
import { eq, and, count, sql } from "drizzle-orm";
import { logger } from "./logger";
import { DistributedLockService } from "./locking/distributed-lock";
import { FinancialLedgerService } from "./ledger";
import type { WalletTransactionType } from "@workspace/db";

type AnyDb = typeof db;

/**
 * Thrown when attempting to debit more than available wallet balance.
 *
 * This error indicates:
 * - User wallet balance < requested debit amount
 * - Transaction was prevented (balance unchanged)
 * - Client should prompt user to add funds or use alternative payment method
 */
export class InsufficientFundsError extends Error {
  constructor(
    public userId: string,
    public requestedAmount: number,
    public availableBalance: number,
  ) {
    super(
      `Insufficient wallet balance: requested ₹${requestedAmount}, available ₹${availableBalance}`
    );
    this.name = "InsufficientFundsError";
  }
}

const DEFAULT_REWARDS = {
  signup_bonus: 50,
  referral_referrer: 100,
  referral_referee: 50,
  first_booking_cashback: 75,
  first_match_cashback: 50,
};

async function getRewardAmount(key: keyof typeof DEFAULT_REWARDS, db_: AnyDb): Promise<number> {
  const [row] = await db_
    .select()
    .from(referralConfigTable)
    .where(and(eq(referralConfigTable.key, key), eq(referralConfigTable.isActive, true)))
    .limit(1);
  return row ? Number(row.value) : DEFAULT_REWARDS[key];
}

export async function creditWallet(
  db_: AnyDb,
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
  offsetAccount: typeof import("@workspace/db").ledgerAccountEnum.enumValues[number] = "expense_cashback_rewards",
  transactionType: WalletTransactionType = "reward",
  referenceType: string = "wallet_credit"
): Promise<number> {
  return await DistributedLockService.withLock(`wallet:${userId}`, async () => {
    return await db_.transaction(async (tx) => {
      const [updated] = await tx
        .update(profilesTable)
        .set({ walletBalance: sql`wallet_balance + ${amount.toString()}::numeric` })
        .where(eq(profilesTable.id, userId))
        .returning({ balance: profilesTable.walletBalance });

      const newBalance = Number(updated?.balance ?? 0);

      // Legacy Wallet Ledger (for frontend display)
      await tx.insert(walletLedgerTable).values({
        userId,
        type: "credit",
        reason,
        amount: amount.toString(),
        balanceBefore: (newBalance - amount).toString(),
        balanceAfter: newBalance.toString(),
        transactionType,
        referenceType,
        referenceId: referenceId ?? null,
        description: reason,
      });

      // True Double-Entry Financial Ledger
      await FinancialLedgerService.transfer(
        offsetAccount,
        "liability_user_wallet",
        amount,
        {
          entityId: userId,
          referenceType,
          referenceId: referenceId ?? userId,
          description: reason,
          tx: tx as any
        }
      );

      return newBalance;
    });
  });
}

/**
 * Debit wallet with overdraft protection.
 *
 * CONCURRENCY-SAFE: Uses conditional UPDATE to prevent negative balances.
 *
 * Algorithm:
 * 1. UPDATE wallet_balance = wallet_balance - amount
 *    WHERE user_id = ? AND wallet_balance >= amount
 * 2. If 0 rows updated → insufficient funds → throw error
 * 3. If 1 row updated → success → log ledger entry
 *
 * Race condition protection:
 * - Two concurrent debits of ₹80 with balance ₹100:
 *   - First debit: succeeds (₹100 - ₹80 = ₹20)
 *   - Second debit: fails (₹20 < ₹80, WHERE clause false)
 *   - InsufficientFundsError thrown for second request
 *
 * Database-level protection:
 * - Profiles table has CHECK (wallet_balance >= 0)
 * - Even if app logic fails, DB constraint prevents negative
 *
 * @param db_ - Database connection or transaction
 * @param userId - User ID to debit
 * @param amount - Amount to debit (must be > 0)
 * @param reason - Human-readable reason for ledger
 * @param referenceId - Optional reference (booking/match ID)
 * @returns New wallet balance after debit
 * @throws {InsufficientFundsError} If balance < amount
 */
export async function debitWallet(
  db_: AnyDb,
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
  offsetAccount: typeof import("@workspace/db").ledgerAccountEnum.enumValues[number] = "revenue_platform_fees",
  transactionType: WalletTransactionType = "debit",
  referenceType: string = "wallet_debit"
): Promise<number> {
  return await DistributedLockService.withLock(`wallet:${userId}`, async () => {
    return await db_.transaction(async (tx) => {
      // Phase 2A: Conditional UPDATE prevents overdraft
      // WHERE clause ensures balance >= amount BEFORE debit
      const [updated] = await tx
        .update(profilesTable)
        .set({ walletBalance: sql`wallet_balance - ${amount.toString()}::numeric` })
        .where(
          and(
            eq(profilesTable.id, userId),
            sql`wallet_balance >= ${amount.toString()}::numeric`
          )
        )
        .returning({ balance: profilesTable.walletBalance });

      // If no row was updated, balance was insufficient
      if (!updated) {
        // Fetch actual balance for error message
        const [profile] = await tx
          .select({ balance: profilesTable.walletBalance })
          .from(profilesTable)
          .where(eq(profilesTable.id, userId))
          .limit(1);

        const availableBalance = Number(profile?.balance ?? 0);
        throw new InsufficientFundsError(userId, amount, availableBalance);
      }

      const newBalance = Number(updated.balance);

      // Legacy Wallet Ledger
      await tx.insert(walletLedgerTable).values({
        userId,
        type: "debit",
        reason,
        amount: amount.toString(),
        balanceBefore: (newBalance + amount).toString(),
        balanceAfter: newBalance.toString(),
        transactionType,
        referenceType,
        referenceId: referenceId ?? null,
        description: reason,
      });

      // True Double-Entry Financial Ledger
      await FinancialLedgerService.transfer(
        "liability_user_wallet",
        offsetAccount,
        amount,
        {
          entityId: userId,
          referenceType,
          referenceId: referenceId ?? userId,
          description: reason,
          tx: tx as any
        }
      );

      logger.info(
        { userId, amount, newBalance, reason },
        "Wallet debited successfully"
      );

      return newBalance;
    });
  });
}

export async function processSignupBonus(userId: string): Promise<boolean> {
  const [profile] = await db
    .select({ signupBonusPaid: profilesTable.signupBonusPaid })
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  if (!profile || profile.signupBonusPaid) return false;

  const amount = await getRewardAmount("signup_bonus", db);
  if (amount <= 0) return false;

  await db.transaction(async (tx) => {
    await creditWallet(tx as unknown as AnyDb, userId, amount, "Signup bonus 🎉");
    await (tx as unknown as AnyDb)
      .update(profilesTable)
      .set({ signupBonusPaid: true })
      .where(eq(profilesTable.id, userId));
    await (tx as unknown as AnyDb).insert(rewardEventsTable).values({
      userId,
      eventType: "signup_bonus",
      amount: amount.toString(),
      notes: "Welcome signup bonus",
    });
  });

  logger.info({ userId, amount }, "Signup bonus credited");
  return true;
}

export async function processReferralRewards(referredUserId: string): Promise<boolean> {
  const [alreadyRewarded] = await db
    .select({ id: rewardEventsTable.id })
    .from(rewardEventsTable)
    .where(
      and(
        eq(rewardEventsTable.userId, referredUserId),
        eq(rewardEventsTable.eventType, "referral_referee"),
      ),
    )
    .limit(1);

  if (alreadyRewarded) return false;

  const [profile] = await db
    .select({ referredBy: profilesTable.referredBy, id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.id, referredUserId))
    .limit(1);

  if (!profile?.referredBy) return false;

  const [referrer] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.referralCode, profile.referredBy))
    .limit(1);

  if (!referrer) return false;

  const referrerAmount = await getRewardAmount("referral_referrer", db);
  const refereeAmount = await getRewardAmount("referral_referee", db);

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as AnyDb;
    if (referrerAmount > 0) {
      await creditWallet(txDb, referrer.id, referrerAmount, `Referral reward — friend joined MATCHPIT`);
      await txDb.insert(rewardEventsTable).values({
        userId: referrer.id,
        eventType: "referral_referrer",
        amount: referrerAmount.toString(),
        referenceId: referredUserId,
        referenceType: "profile",
        notes: `Referred user ${referredUserId}`,
      });
    }
    if (refereeAmount > 0) {
      await creditWallet(txDb, referredUserId, refereeAmount, `Referral welcome credit`);
      await txDb.insert(rewardEventsTable).values({
        userId: referredUserId,
        eventType: "referral_referee",
        amount: refereeAmount.toString(),
        referenceId: referrer.id,
        referenceType: "profile",
        notes: `Referred by ${profile.referredBy}`,
      });
    }
  });

  logger.info({ referredUserId, referrerAmount, refereeAmount }, "Referral rewards credited");
  return true;
}

export async function processFirstBookingCashback(
  userId: string,
  bookingId: string,
): Promise<boolean> {
  const [alreadyRewarded] = await db
    .select({ id: rewardEventsTable.id })
    .from(rewardEventsTable)
    .where(
      and(
        eq(rewardEventsTable.userId, userId),
        eq(rewardEventsTable.eventType, "first_booking_cashback"),
      ),
    )
    .limit(1);

  if (alreadyRewarded) return false;

  const confirmedCount = await db
    .select({ n: count() })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.userId, userId), eq(bookingsTable.status, "confirmed")));

  if (Number(confirmedCount[0]?.n ?? 0) > 1) return false;

  const amount = await getRewardAmount("first_booking_cashback", db);
  if (amount <= 0) return false;

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as AnyDb;
    await creditWallet(txDb, userId, amount, `First booking cashback 🏆`);
    await txDb.insert(rewardEventsTable).values({
      userId,
      eventType: "first_booking_cashback",
      amount: amount.toString(),
      referenceId: bookingId,
      referenceType: "booking",
    });
  });

  logger.info({ userId, bookingId, amount }, "First booking cashback credited");
  return true;
}

export async function processFirstMatchCashback(
  userId: string,
  matchId: string,
): Promise<boolean> {
  const [alreadyRewarded] = await db
    .select({ id: rewardEventsTable.id })
    .from(rewardEventsTable)
    .where(
      and(
        eq(rewardEventsTable.userId, userId),
        eq(rewardEventsTable.eventType, "first_match_cashback"),
      ),
    )
    .limit(1);

  if (alreadyRewarded) return false;

  const hostedCount = await db
    .select({ n: count() })
    .from(hostedMatchesTable)
    .where(eq(hostedMatchesTable.hostUserId, userId));

  if (Number(hostedCount[0]?.n ?? 0) > 1) return false;

  const amount = await getRewardAmount("first_match_cashback", db);
  if (amount <= 0) return false;

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as AnyDb;
    await creditWallet(txDb, userId, amount, `First hosted match cashback 🎯`);
    await txDb.insert(rewardEventsTable).values({
      userId,
      eventType: "first_match_cashback",
      amount: amount.toString(),
      referenceId: matchId,
      referenceType: "hosted_match",
    });
  });

  logger.info({ userId, matchId, amount }, "First match cashback credited");
  return true;
}


/**
 * Process host milestone rewards for completed matches.
 *
 * IDEMPOTENT: Each milestone credited exactly once per user.
 *
 * Algorithm:
 * 1. Fetch all previously awarded milestones for user
 * 2. For each milestone ≤ completedHostedCount:
 *    - Skip if already awarded
 *    - Credit wallet with milestone amount
 *    - Log reward_events entry with metadata
 *
 * Milestones (Phase 2A amounts):
 * - 1 match → ₹25
 * - 5 matches → ₹50
 * - 10 matches → ₹100
 * - 25 matches → ₹250
 * - 50 matches → ₹500
 * - 100 matches → ₹1,000
 *
 * Backfill support:
 * - If user has 10 completed matches but never received rewards:
 *   - Awards milestones 1, 5, AND 10 in single call
 *   - Total: ₹175 credited
 *
 * @param userId - User ID to process rewards for
 * @param completedHostedCount - Current completed hosted match count
 */
export async function processHostMilestoneRewards(
  userId: string,
  completedHostedCount: number,
): Promise<void> {
  // Fetch all existing host_milestone_reward events for this user in one query
  const existingMilestoneEvents = await db
    .select({ metadata: rewardEventsTable.metadata })
    .from(rewardEventsTable)
    .where(
      and(
        eq(rewardEventsTable.userId, userId),
        eq(rewardEventsTable.eventType, "host_milestone_reward"),
      ),
    );

  // Build a set of already-awarded milestone thresholds
  const awardedThresholds = new Set<number>(
    existingMilestoneEvents
      .map((row) => {
        const meta = row.metadata as { milestoneCount?: number } | null;
        return meta?.milestoneCount;
      })
      .filter((v): v is number => typeof v === "number"),
  );

  // Process each milestone threshold in ascending order
  // Use centralized milestone config from financial-config
  const thresholds = getAllMilestones();

  for (const threshold of thresholds) {
    if (threshold > completedHostedCount) continue;
    if (awardedThresholds.has(threshold)) continue;

    const rewardAmount = getMilestoneReward(threshold);

    await db.transaction(async (tx) => {
      const txDb = tx as unknown as AnyDb;
      await creditWallet(
        txDb,
        userId,
        rewardAmount,
        `Host milestone reward — ${threshold} hosted match${threshold === 1 ? "" : "es"} 🏆`,
      );
      await txDb.insert(rewardEventsTable).values({
        userId,
        eventType: "host_milestone_reward",
        amount: rewardAmount.toString(),
        metadata: {
          milestoneCount: threshold,
          rewardAmount,
          completedHostedCountAtAward: completedHostedCount,
        },
      });
    });

    logger.info(
      { userId, threshold, rewardAmount, completedHostedCount },
      "Host milestone reward credited (Phase 2A amounts)"
    );
  }
}

export async function getWalletBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: profilesTable.walletBalance })
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);
  return Number(row?.balance ?? 0);
}

export async function hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
  const balance = await getWalletBalance(userId);
  return balance >= amount;
}

export async function seedDefaultReferralConfig(): Promise<void> {
  const configs = [
    { key: "signup_bonus", value: "50", description: "Wallet credit on new signup (₹)" },
    { key: "referral_referrer", value: "100", description: "Reward for referrer when friend signs up (₹)" },
    { key: "referral_referee", value: "50", description: "Welcome reward for referred user (₹)" },
    { key: "first_booking_cashback", value: "75", description: "Cashback on first private booking (₹)" },
    { key: "first_match_cashback", value: "50", description: "Cashback on first hosted match (₹)" },
    { key: "host_milestone_1", value: "50", description: "Host milestone reward at 1 completed match (₹)" },
    { key: "host_milestone_5", value: "100", description: "Host milestone reward at 5 completed matches (₹)" },
    { key: "host_milestone_10", value: "200", description: "Host milestone reward at 10 completed matches (₹)" },
    { key: "host_milestone_25", value: "500", description: "Host milestone reward at 25 completed matches (₹)" },
    { key: "host_milestone_50", value: "1000", description: "Host milestone reward at 50 completed matches (₹)" },
    { key: "host_milestone_100", value: "2000", description: "Host milestone reward at 100 completed matches (₹)" },
  ];

  for (const cfg of configs) {
    const [exists] = await db
      .select({ id: referralConfigTable.id })
      .from(referralConfigTable)
      .where(eq(referralConfigTable.key, cfg.key))
      .limit(1);

    if (!exists) {
      await db.insert(referralConfigTable).values(cfg);
    }
  }
}
