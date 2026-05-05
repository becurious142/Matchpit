import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    // Profile may not exist yet for brand-new users who haven't hit /profile/me yet.
    // Return an empty array — new users have no notifications.
    if (!profile) {
      res.json([]);
      return;
    }

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, profile.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);

    res.json(
      notifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        referenceId: n.referenceId ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing notifications");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch notifications" });
  }
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const id = req.params.id as string;
    const [updated] = await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, profile.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Notification not found" });
      return;
    }

    res.json({
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      title: updated.title,
      body: updated.body,
      isRead: updated.isRead,
      referenceId: updated.referenceId ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error marking notification read");
    res.status(500).json({ error: "internal_error", message: "Failed to update notification" });
  }
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }

    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.userId, profile.id), eq(notificationsTable.isRead, false)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error marking all notifications read");
    res.status(500).json({ error: "internal_error", message: "Failed to mark all read" });
  }
});

export default router;
