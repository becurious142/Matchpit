import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { walletLedgerTable, profilesTable } from "@workspace/db";
import { eq, desc, sum } from "drizzle-orm";
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
      .limit(50);

    const totalEarned = ledger
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalSpent = ledger
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    res.json({
      balance: Number(profile.walletBalance),
      totalEarned,
      totalSpent,
      ledger: ledger.map((e) => ({
        id: e.id,
        type: e.type,
        reason: e.reason,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching wallet");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch wallet" });
  }
});

export default router;
