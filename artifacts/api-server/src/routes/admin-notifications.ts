import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  notificationDispatchLogsTable,
  adminAuditLogsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireRole } from "../middlewares/rbac";
import { desc, count, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();
router.use(requireAuth, requireRole(["admin", "superadmin"]));

router.get("/failures", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [totalCount] = await db
      .select({ count: count() })
      .from(notificationDispatchLogsTable)
      .where(eq(notificationDispatchLogsTable.status, "failed"));

    const logs = await db
      .select()
      .from(notificationDispatchLogsTable)
      .where(eq(notificationDispatchLogsTable.status, "failed"))
      .orderBy(desc(notificationDispatchLogsTable.createdAt))
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
    res.status(500).json({ error: "Failed to fetch notification failures" });
  }
});

router.post("/retry/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { userId: adminId } = getAuth(req);

    if (!adminId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [log] = await db
      .select()
      .from(notificationDispatchLogsTable)
      .where(eq(notificationDispatchLogsTable.id, id));

    if (!log) {
      return res.status(404).json({ error: "Notification log not found" });
    }

    if (log.status === "sent") {
      return res.status(400).json({ error: "Notification already sent successfully" });
    }

    // Reset the retry count and queue it for the next cron job (Queue-compatible abstraction)
    const [updated] = await db
      .update(notificationDispatchLogsTable)
      .set({
        status: "queued",
        retryCount: 0, // Reset to allow up to 3 fresh attempts
        updatedAt: new Date(),
      })
      .where(eq(notificationDispatchLogsTable.id, id))
      .returning();

    // Log the admin action
    await db.insert(adminAuditLogsTable).values({
      adminId,
      action: "notification_retry_queued",
      targetType: "notification_dispatch_log",
      targetId: id,
      payload: { previousStatus: log.status, previousRetryCount: log.retryCount }
    });

    return res.json({ message: "Notification queued for retry", data: updated });
  } catch (error) {
    return res.status(500).json({ error: "Failed to enqueue notification retry" });
  }
});

export const adminNotificationsRouter = router;
