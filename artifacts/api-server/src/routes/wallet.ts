/**
 * Phase 5: Wallet API Routes
 *
 * GET  /wallet              — balance + reward summary
 * GET  /wallet/history      — paginated ledger
 * GET  /wallet/rewards      — reward events list
 * POST /wallet/redeem       — redeem wallet balance
 * GET  /wallet/referrals    — referral statistics
 * POST /wallet/referral-code — generate referral code
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  walletLedgerTable,
  profilesTable,
  rewardEventsTable,
  referralsTable,
} from "@workspace/db";
import { eq, desc, count, and, sum } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import {
  getWalletBalance,
  getWalletHistory,
  redeemWalletBalance,
  InsufficientFundsError,
} from "../lib/rewards";
import { ensureReferralCode } from "../lib/referral";


const router: IRouter = Router();

// ─── GET /wallet ──────────────────────────────────────────────────────────────

router.get("/wallet", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    // Parallel: ledger summary + reward summary
    const [ledgerSummary, recentRewards] = await Promise.all([
      db
        .select({
          totalCredits: sum(walletLedgerTable.amount).mapWith(Number),
        })
        .from(walletLedgerTable)
        .where(
          and(
            eq(walletLedgerTable.userId, profile.id),
            eq(walletLedgerTable.type, "credit"),
          ),
        ),
      db
        .select()
        .from(rewardEventsTable)
        .where(eq(rewardEventsTable.userId, profile.id))
        .orderBy(desc(rewardEventsTable.createdAt))
        .limit(5),
    ]);

    const [debitSummary] = await db
      .select({ totalDebits: sum(walletLedgerTable.amount).mapWith(Number) })
      .from(walletLedgerTable)
      .where(
        and(
          eq(walletLedgerTable.userId, profile.id),
          eq(walletLedgerTable.type, "debit"),
        ),
      );

    res.json({
      balance: Number(profile.walletBalance),
      walletAutoUse: profile.walletAutoUse,
      totalEarned: ledgerSummary[0]?.totalCredits ?? 0,
      totalSpent: debitSummary?.totalDebits ?? 0,
      recentRewards: recentRewards.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        amount: Number(r.amount),
        status: r.status,
        description: r.notes ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching wallet");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch wallet" });
  }
});

// ─── GET /wallet/history ─────────────────────────────────────────────────────

router.get("/wallet/history", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));

    const result = await getWalletHistory(profile.id, page, limit);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error fetching wallet history");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch wallet history" });
  }
});

// ─── GET /wallet/rewards ─────────────────────────────────────────────────────

router.get("/wallet/rewards", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const [events, totalResult] = await Promise.all([
      db
        .select()
        .from(rewardEventsTable)
        .where(eq(rewardEventsTable.userId, profile.id))
        .orderBy(desc(rewardEventsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(rewardEventsTable)
        .where(eq(rewardEventsTable.userId, profile.id)),
    ]);

    res.json({
      rewards: events.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        amount: Number(r.amount),
        status: r.status,
        referenceType: r.referenceType ?? null,
        referenceId: r.referenceId ?? null,
        notes: r.notes ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        processedAt: r.processedAt?.toISOString() ?? null,
        reversedAt: r.reversedAt?.toISOString() ?? null,
        metadata: r.metadata ?? {},
        createdAt: r.createdAt.toISOString(),
      })),
      total: Number(totalResult[0]?.total ?? 0),
      page,
      limit,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching wallet rewards");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch rewards" });
  }
});

// ─── POST /wallet/redeem ─────────────────────────────────────────────────────

const redeemSchema = {
  parse(body: unknown): { amount: number } {
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>).amount !== "number"
    ) {
      throw new Error("amount must be a number");
    }
    return body as { amount: number };
  },
};

router.post("/wallet/redeem", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    let amount: number;
    try {
      amount = redeemSchema.parse(req.body).amount;
      if (amount <= 0) throw new Error("Amount must be positive");
    } catch (err) {
      res.status(400).json({ error: "validation_error", message: (err as Error).message });
      return;
    }

    const result = await redeemWalletBalance(profile.id, amount);

    if (!result.success) {
      res.status(422).json({
        error: "insufficient_funds",
        message: result.message,
        balance: result.newBalance,
      });
      return;
    }

    res.json({
      success: true,
      redeemedAmount: amount,
      newBalance: result.newBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Error redeeming wallet balance");

    res.status(500).json({ error: "internal_error", message: "Failed to redeem wallet" });
  }
});

// ─── GET /wallet/referrals ────────────────────────────────────────────────────

router.get("/wallet/referrals", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const referralCode = profile.referralCode ?? null;

    const [myReferrals, totalEarned] = await Promise.all([
      db
        .select({
          id: referralsTable.id,
          status: referralsTable.status,
          rewardAmount: referralsTable.rewardAmount,
          qualifiedAt: referralsTable.qualifiedAt,
          creditedAt: referralsTable.creditedAt,
          createdAt: referralsTable.createdAt,
        })
        .from(referralsTable)
        .where(eq(referralsTable.referrerUserId, profile.id))
        .orderBy(desc(referralsTable.createdAt)),

      db
        .select({ total: sum(referralsTable.rewardAmount).mapWith(Number) })
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.referrerUserId, profile.id),
            eq(referralsTable.status, "credited"),
          ),
        ),
    ]);

    res.json({
      referralCode,
      totalReferrals: myReferrals.length,
      creditedReferrals: myReferrals.filter((r) => r.status === "credited").length,
      pendingReferrals: myReferrals.filter((r) => r.status === "pending").length,
      totalEarned: totalEarned[0]?.total ?? 0,
      referrals: myReferrals.map((r) => ({
        id: r.id,
        status: r.status,
        rewardAmount: Number(r.rewardAmount),
        qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
        creditedAt: r.creditedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching referrals");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch referrals" });
  }
});

// ─── POST /wallet/referral-code ───────────────────────────────────────────────

router.post("/wallet/referral-code", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const code = await ensureReferralCode(profile.id);
    res.json({ referralCode: code });
  } catch (err) {
    req.log.error({ err }, "Error generating referral code");
    res.status(500).json({ error: "internal_error", message: "Failed to generate referral code" });
  }
});

export default router;
