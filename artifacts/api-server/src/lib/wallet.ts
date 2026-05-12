import { db } from "@workspace/db";
import {
  walletLedgerTable,
  profilesTable,
  rewardEventsTable,
  referralConfigTable,
  bookingsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
} from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { logger } from "./logger";

type AnyDb = typeof db;

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
): Promise<number> {
  const [updated] = await db_
    .update(profilesTable)
    .set({ walletBalance: sql`wallet_balance + ${amount.toString()}::numeric` })
    .where(eq(profilesTable.id, userId))
    .returning({ balance: profilesTable.walletBalance });

  const newBalance = Number(updated?.balance ?? 0);

  await db_.insert(walletLedgerTable).values({
    userId,
    type: "credit",
    reason,
    amount: amount.toString(),
    balanceAfter: newBalance.toString(),
    referenceId: referenceId ?? null,
  });

  return newBalance;
}

export async function debitWallet(
  db_: AnyDb,
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<number> {
  const [updated] = await db_
    .update(profilesTable)
    .set({ walletBalance: sql`wallet_balance - ${amount.toString()}::numeric` })
    .where(eq(profilesTable.id, userId))
    .returning({ balance: profilesTable.walletBalance });

  const newBalance = Number(updated?.balance ?? 0);

  await db_.insert(walletLedgerTable).values({
    userId,
    type: "debit",
    reason,
    amount: amount.toString(),
    balanceAfter: newBalance.toString(),
    referenceId: referenceId ?? null,
  });

  return newBalance;
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

export async function processUnderfillRefund(
  userId: string,
  matchId: string,
  amount: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as AnyDb;
    await creditWallet(txDb, userId, amount, `Refund — match cancelled (underfilled)`, matchId);
    await txDb.insert(rewardEventsTable).values({
      userId,
      eventType: "underfill_refund",
      amount: amount.toString(),
      referenceId: matchId,
      referenceType: "hosted_match",
      notes: "Match cancelled due to insufficient players",
    });
  });
}

export async function processCancellationRefund(
  userId: string,
  referenceId: string,
  referenceType: "booking" | "hosted_match",
  amount: number,
  txDb?: AnyDb,
): Promise<void> {
  const execute = async (dbInstance: AnyDb) => {
    await creditWallet(dbInstance, userId, amount, `Cancellation refund`, referenceId);
    await dbInstance.insert(rewardEventsTable).values({
      userId,
      eventType: "cancellation_refund",
      amount: amount.toString(),
      referenceId,
      referenceType,
    });
  };

  if (txDb) {
    await execute(txDb);
  } else {
    await db.transaction(async (tx) => {
      await execute(tx as unknown as AnyDb);
    });
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
