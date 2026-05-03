import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  userReportsTable,
  userStrikesTable,
  profilesTable,
} from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, getProfileByClerkId } from "../lib/auth";
import { trackEvent, EVENTS } from "../lib/analytics";

const router: IRouter = Router();

// ─── POST /reports — Submit a report ─────────────────────────────────────────
router.post("/reports", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const { targetType, targetId, reason } = req.body;
    if (!targetType || !targetId || !reason?.trim()) {
      res.status(400).json({ error: "validation", message: "targetType, targetId, reason required" });
      return;
    }

    const [report] = await db.insert(userReportsTable).values({
      reporterUserId: profile.id,
      targetType,
      targetId,
      reason: reason.trim(),
    }).returning();

    setImmediate(() => trackEvent(EVENTS.REPORT_SUBMITTED, profile.id, { targetType, targetId }));

    res.status(201).json(report);
  } catch (err) {
    req.log.error({ err }, "Error submitting report");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /admin/reports ───────────────────────────────────────────────────────
router.get("/admin/reports", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const reports = await db.select({
      report: userReportsTable,
      reporterName: profilesTable.fullName,
    })
      .from(userReportsTable)
      .leftJoin(profilesTable, eq(userReportsTable.reporterUserId, profilesTable.id))
      .orderBy(desc(userReportsTable.createdAt))
      .limit(200);

    const filtered = status
      ? reports.filter((r) => r.report.status === status)
      : reports;

    res.json(filtered.map(({ report, reporterName }) => ({
      id: report.id,
      reporterUserId: report.reporterUserId,
      reporterName: reporterName ?? "Unknown",
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching reports");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── PATCH /admin/reports/:reportId ──────────────────────────────────────────
router.patch("/admin/reports/:reportId", requireAdmin, async (req, res) => {
  try {
    const reportId = req.params.reportId as string;
    const { status } = req.body;
    if (!["pending","reviewed","dismissed","actioned"].includes(status)) {
      res.status(400).json({ error: "validation", message: "invalid status" });
      return;
    }
    const [updated] = await db.update(userReportsTable)
      .set({ status })
      .where(eq(userReportsTable.id, reportId))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating report");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /admin/strikes ───────────────────────────────────────────────────────
router.get("/admin/strikes", requireAdmin, async (req, res) => {
  try {
    const strikes = await db.select({
      strike: userStrikesTable,
      userName: profilesTable.fullName,
      userEmail: profilesTable.email,
      isSuspended: profilesTable.isSuspended,
      strikePoints: profilesTable.strikePoints,
    })
      .from(userStrikesTable)
      .leftJoin(profilesTable, eq(userStrikesTable.userId, profilesTable.id))
      .orderBy(desc(userStrikesTable.createdAt))
      .limit(500);

    res.json(strikes.map(({ strike, userName, userEmail, isSuspended, strikePoints }) => ({
      id: strike.id,
      userId: strike.userId,
      userName: userName ?? "Unknown",
      userEmail: userEmail ?? "Unknown",
      type: strike.type,
      points: strike.points,
      notes: strike.notes,
      isSuspended: isSuspended ?? false,
      totalStrikePoints: Number(strikePoints ?? 0),
      createdAt: strike.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching strikes");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /admin/users/:userId/suspend ───────────────────────────────────────
router.post("/admin/users/:userId/suspend", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    const { suspended } = req.body;
    await db.update(profilesTable)
      .set({ isSuspended: suspended ?? true })
      .where(eq(profilesTable.id, userId));
    res.json({ ok: true, suspended: suspended ?? true });
  } catch (err) {
    req.log.error({ err }, "Error suspending user");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /admin/dispatch-logs ─────────────────────────────────────────────────
router.get("/admin/dispatch-logs", requireAdmin, async (req, res) => {
  try {
    const { db: dbConn } = await import("@workspace/db");
    const { notificationDispatchLogsTable: logsTable } = await import("@workspace/db");
    const logs = await dbConn.select({
      log: logsTable,
      userName: profilesTable.fullName,
    })
      .from(logsTable)
      .leftJoin(profilesTable, eq(logsTable.userId, profilesTable.id))
      .orderBy(desc(logsTable.createdAt))
      .limit(500);

    res.json(logs.map(({ log, userName }) => ({
      id: log.id,
      userId: log.userId,
      userName: userName ?? "Unknown",
      channel: log.channel,
      templateKey: log.templateKey,
      status: log.status,
      destination: log.destination,
      createdAt: log.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching dispatch logs");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /admin/users-suspicious ─────────────────────────────────────────────
router.get("/admin/users-suspicious", requireAdmin, async (req, res) => {
  try {
    const suspicious = await db.select({
      id: profilesTable.id,
      fullName: profilesTable.fullName,
      email: profilesTable.email,
      strikePoints: profilesTable.strikePoints,
      isSuspended: profilesTable.isSuspended,
      trustScore: profilesTable.trustScore,
    })
      .from(profilesTable)
      .where(sql`${profilesTable.strikePoints} > 0 OR ${profilesTable.isSuspended} = true OR ${profilesTable.trustScore}::numeric < 60`)
      .orderBy(desc(profilesTable.strikePoints));

    res.json(suspicious);
  } catch (err) {
    req.log.error({ err }, "Error fetching suspicious users");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
