import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { walletLedgerTable, profilesTable, rewardEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

router.get("/wallet", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const ledger = await db
      .select()
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.userId, profile.id))
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(100);

    const totalEarned = ledger
      .filter((e) => e.type === "credit")
      .reduce((s, e) => s + Number(e.amount), 0);

    const totalSpent = ledger
      .filter((e) => e.type === "debit")
      .reduce((s, e) => s + Number(e.amount), 0);

    const rewards = await db
      .select()
      .from(rewardEventsTable)
      .where(eq(rewardEventsTable.userId, profile.id))
      .orderBy(desc(rewardEventsTable.createdAt))
      .limit(20);

    res.json({
      balance: Number(profile.walletBalance),
      walletAutoUse: profile.walletAutoUse,
      totalEarned,
      totalSpent,
      ledger: ledger.map((e) => ({
        id: e.id,
        type: e.type,
        reason: e.reason,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        referenceId: e.referenceId ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      rewards: rewards.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        amount: Number(r.amount),
        notes: r.notes ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching wallet");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch wallet" });
  }
});

export default router;
