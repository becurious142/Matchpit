import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  cronExecutionsTable,
  adminAuditLogsTable,
  paymentsTable,
  paymentRefundsTable,
  venuePayoutLedgerTable,
  reconciliationReportsTable,
  queueReplaysTable,
} from "@workspace/db";
import { ALL_QUEUE_NAMES, getQueueByName } from "../queues/queues";
import { requireAuth } from "../lib/auth";
import { requireRole } from "../middlewares/rbac";
import { desc, sql, count, eq, and, gt } from "drizzle-orm";

const router = Router();
router.use(requireAuth, requireRole(["admin", "superadmin"]));

// Simple in-memory cache for Ops Overview
let opsOverviewCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 60000; // 60 seconds

router.get("/overview", async (req: Request, res: Response) => {
  if (opsOverviewCache && Date.now() - opsOverviewCache.timestamp < CACHE_TTL_MS) {
    res.json(opsOverviewCache.data);
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's GMV (successful payments)
    const [gmvResult] = await db
      .select({ total: sql<number>`sum(gross_amount)` })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.status, "payment_captured"), gt(paymentsTable.createdAt, today)));

    // Get pending refunds
    const [pendingRefunds] = await db
      .select({ count: count() })
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.status, "pending"));

    // Get failed refunds
    const [failedRefunds] = await db
      .select({ count: count() })
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.status, "failed"));

    // Get unbatched payouts total liability
    const [pendingPayouts] = await db
      .select({ total: sql<number>`sum(venue_payable)` })
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.status, "pending"));

    const [anomalyStats] = await db
      .select({ total: count() })
      .from(reconciliationReportsTable)
      .where(eq(reconciliationReportsTable.resolved, false));

    const [replayStats] = await db
      .select({ total: count() })
      .from(queueReplaysTable);

    const queueLag = await Promise.all(
      ALL_QUEUE_NAMES.map(async (name) => {
        const q = getQueueByName(name);
        const waiting = await q.getWaitingCount();
        const delayed = await q.getDelayedCount();
        const active = await q.getActiveCount();
        const failed = await q.getFailedCount();
        return { name, waiting, delayed, active, failed };
      })
    );

    const data = {
      dailyGmv: Number(gmvResult?.total || 0),
      pendingRefunds: pendingRefunds.count,
      failedRefunds: failedRefunds.count,
      pendingPayoutsLiability: Number(pendingPayouts?.total || 0),
      unresolvedAnomalies: anomalyStats.total,
      replayCount: replayStats.total,
      queueLag,
      timestamp: new Date().toISOString(),
    };

    opsOverviewCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ops overview" });
  }
});

router.get("/crons", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [totalCount] = await db.select({ count: count() }).from(cronExecutionsTable);
    const executions = await db
      .select()
      .from(cronExecutionsTable)
      .orderBy(desc(cronExecutionsTable.startedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: executions,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cron executions" });
  }
});

router.get("/audit-feed", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [totalCount] = await db.select({ count: count() }).from(adminAuditLogsTable);
    const logs = await db
      .select()
      .from(adminAuditLogsTable)
      .orderBy(desc(adminAuditLogsTable.timestamp))
      .limit(limit)
      .offset(offset);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit feed" });
  }
});

export const adminOpsRouter = router;
