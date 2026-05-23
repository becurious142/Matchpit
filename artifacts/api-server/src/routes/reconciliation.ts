import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  reconciliationReportsTable,
  adminAuditLogsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireRole } from "../middlewares/rbac";
import { desc, count, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { ReconciliationWorker } from "../workers/reconciliation.worker";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth, requireRole(["admin", "superadmin"]));

router.post("/run", async (req: Request, res: Response) => {
  try {
    const result = await ReconciliationWorker.runReconciliation();
    
    if (!result.success) {
      logger.error("SYSTEM FREEZE: Anomalies detected during manual reconciliation run.");
      // Would dispatch an alert / freeze configuration here
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, "Failed to run reconciliation worker manually");
    res.status(500).json({ error: "Failed to run reconciliation" });
  }
});

router.get("/reports", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    
    // Optional filter
    const resolved = req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : undefined;

    let query = db.select().from(reconciliationReportsTable).$dynamic();
    let countQuery = db.select({ count: count() }).from(reconciliationReportsTable).$dynamic();

    if (resolved !== undefined) {
      query = query.where(eq(reconciliationReportsTable.resolved, resolved));
      countQuery = countQuery.where(eq(reconciliationReportsTable.resolved, resolved));
    }

    const [totalCount] = await countQuery;
    const reports = await query
      .orderBy(desc(reconciliationReportsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: reports,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reconciliation reports" });
  }
});

router.post("/resolve/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { resolutionNotes } = req.body;
    const { userId: adminId } = getAuth(req);

    if (!adminId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [report] = await db
      .select()
      .from(reconciliationReportsTable)
      .where(eq(reconciliationReportsTable.id, id));

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    if (report.resolved) {
      return res.status(400).json({ error: "Report is already resolved" });
    }

    const [updated] = await db
      .update(reconciliationReportsTable)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolutionNotes: resolutionNotes || "Resolved by admin",
      })
      .where(eq(reconciliationReportsTable.id, id))
      .returning();

    // Log the admin action
    await db.insert(adminAuditLogsTable).values({
      adminId,
      action: "reconciliation_resolved",
      targetType: "reconciliation_report",
      targetId: id,
      payload: { resolutionNotes, reportType: report.reportType }
    });

    return res.json({ success: true, message: "Reconciliation completed", data: updated });
  } catch (error) {
    return res.status(500).json({ error: "Failed to run reconciliation" });
  }
});

export const reconciliationRouter = router;
