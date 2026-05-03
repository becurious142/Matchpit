import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  matchMessagesTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  profilesTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

// ─── GET /hosted-matches/:matchId/chat ────────────────────────────────────────
router.get("/hosted-matches/:matchId/chat", async (req, res) => {
  try {
    const matchId = req.params.matchId as string;
    const limit = Math.min(100, Number(req.query.limit ?? 50));

    const [match] = await db.select({ id: hostedMatchesTable.id })
      .from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found" }); return; }

    const messages = await db.select({
      msg: matchMessagesTable,
      authorName: profilesTable.fullName,
      authorAvatar: profilesTable.avatarUrl,
    })
      .from(matchMessagesTable)
      .leftJoin(profilesTable, eq(matchMessagesTable.userId, profilesTable.id))
      .where(eq(matchMessagesTable.matchId, matchId))
      .orderBy(desc(matchMessagesTable.createdAt))
      .limit(limit);

    res.json(messages.reverse().map(({ msg, authorName, authorAvatar }) => ({
      id: msg.id,
      matchId: msg.matchId,
      userId: msg.userId,
      authorName: authorName ?? "Player",
      authorAvatar: authorAvatar ?? null,
      message: msg.message,
      createdAt: msg.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching match chat");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /hosted-matches/:matchId/chat ──────────────────────────────────────
router.post("/hosted-matches/:matchId/chat", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const matchId = req.params.matchId as string;
    const { message } = req.body;

    if (!message?.trim()) {
      res.status(400).json({ error: "validation", message: "message is required" });
      return;
    }
    if (message.trim().length > 500) {
      res.status(400).json({ error: "validation", message: "message too long (max 500 chars)" });
      return;
    }

    const [match] = await db.select({ id: hostedMatchesTable.id, hostUserId: hostedMatchesTable.hostUserId })
      .from(hostedMatchesTable).where(eq(hostedMatchesTable.id, matchId)).limit(1);
    if (!match) { res.status(404).json({ error: "not_found" }); return; }

    // Allow host + participants
    const isHost = match.hostUserId === profile.id;
    if (!isHost) {
      const [participant] = await db.select({ id: hostedMatchParticipantsTable.id })
        .from(hostedMatchParticipantsTable)
        .where(and(
          eq(hostedMatchParticipantsTable.matchId, matchId),
          eq(hostedMatchParticipantsTable.userId, profile.id),
        )).limit(1);
      if (!participant) {
        res.status(403).json({ error: "not_participant", message: "Only match participants can chat" });
        return;
      }
    }

    const [msg] = await db.insert(matchMessagesTable).values({
      matchId,
      userId: profile.id,
      message: message.trim(),
    }).returning();

    res.status(201).json({
      id: msg.id,
      matchId: msg.matchId,
      userId: msg.userId,
      authorName: profile.fullName,
      authorAvatar: profile.avatarUrl ?? null,
      message: msg.message,
      createdAt: msg.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error posting match chat message");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
