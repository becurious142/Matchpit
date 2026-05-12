import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  squadsTable,
  squadMembersTable,
  squadPostsTable,
  squadChallengesTable,
  profilesTable,
  citiesTable,
  hostedMatchesTable,
  notificationsTable,
  slotsTable,
} from "@workspace/db";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { createAchievementPostForSquadChallengeWin } from "../lib/social-events";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

function formatSquad(s: typeof squadsTable.$inferSelect, memberCount = 0, isJoined = false) {
  return {
    id: s.id,
    name: s.name,
    logoUrl: s.logoUrl ?? null,
    cityId: s.cityId,
    sport: s.sport,
    captainUserId: s.captainUserId,
    description: s.description ?? null,
    wins: s.wins,
    losses: s.losses,
    trustRating: Number(s.trustRating),
    memberCount,
    isJoined,
    createdAt: s.createdAt.toISOString(),
  };
}

// ─── GET /squads ──────────────────────────────────────────────────────────────
router.get("/squads", async (req, res) => {
  try {
    const sport = req.query.sport as string | undefined;
    const [activeCity] = await db.select({ id: citiesTable.id })
      .from(citiesTable).where(eq(citiesTable.isActive, true)).limit(1);

    const squads = await db.select().from(squadsTable)
      .where(and(
        activeCity ? eq(squadsTable.cityId, activeCity.id) : undefined,
        sport ? sql`${squadsTable.sport} = ${sport}` : undefined,
      ))
      .orderBy(desc(squadsTable.wins))
      .limit(50);

    const squadsWithCounts = await Promise.all(squads.map(async (s) => {
      const [row] = await db.select({ c: count() }).from(squadMembersTable)
        .where(eq(squadMembersTable.squadId, s.id));
      return formatSquad(s, Number(row.c));
    }));

    res.json(squadsWithCounts);
  } catch (err) {
    req.log.error({ err }, "Error listing squads");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /squads/:id ──────────────────────────────────────────────────────────
router.get("/squads/:id", async (req, res) => {
  try {
    const squadId = req.params.id as string;
    if (!isValidUUID(squadId)) {
      res.status(400).json({ error: "invalid_id", message: "Invalid squad ID format" });
      return;
    }
    const [squad] = await db.select().from(squadsTable)
      .where(eq(squadsTable.id, squadId)).limit(1);
    if (!squad) { res.status(404).json({ error: "not_found" }); return; }

    const members = await db.select({
      member: squadMembersTable,
      name: profilesTable.fullName,
      avatar: profilesTable.avatarUrl,
      trust: profilesTable.trustScore,
    }).from(squadMembersTable)
      .leftJoin(profilesTable, eq(squadMembersTable.userId, profilesTable.id))
      .where(eq(squadMembersTable.squadId, squadId))
      .orderBy(desc(squadMembersTable.joinedAt));

    const posts = await db.select({
      post: squadPostsTable,
      authorName: profilesTable.fullName,
      authorAvatar: profilesTable.avatarUrl,
    }).from(squadPostsTable)
      .leftJoin(profilesTable, eq(squadPostsTable.userId, profilesTable.id))
      .where(eq(squadPostsTable.squadId, squadId))
      .orderBy(desc(squadPostsTable.createdAt))
      .limit(30);

    res.json({
      ...formatSquad(squad, members.length),
      members: members.map(({ member, name, avatar, trust }) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        name: name ?? "Player",
        avatar: avatar ?? null,
        trustScore: Number(trust ?? 100),
        joinedAt: member.joinedAt.toISOString(),
      })),
      posts: posts.map(({ post, authorName, authorAvatar }) => ({
        id: post.id,
        userId: post.userId,
        authorName: authorName ?? "Player",
        authorAvatar: authorAvatar ?? null,
        message: post.message,
        createdAt: post.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching squad");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /squads/create ──────────────────────────────────────────────────────
router.post("/squads/create", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { 
      res.status(404).json({ error: "not_found", message: "Profile not found" }); 
      return; 
    }

    const { name, sport, description, logoUrl } = req.body;
    if (!name?.trim() || !sport?.trim()) {
      res.status(400).json({ error: "validation", message: "name and sport required" });
      return;
    }

    // Check for active city, but don't fail if none exists
    let cityId = null;
    try {
      const [activeCity] = await db.select({ id: citiesTable.id })
        .from(citiesTable).where(eq(citiesTable.isActive, true)).limit(1);
      cityId = activeCity?.id ?? null;
      if (!cityId) {
        req.log.warn("No active city found, creating squad without city");
      }
    } catch (cityError) {
      req.log.warn({ cityError }, "Error fetching active city, continuing without city");
    }

    // Create squad with better error handling
    let squad;
    try {
      const [createdSquad] = await db.insert(squadsTable).values({
        name: name.trim(),
        sport: sport.trim(),
        captainUserId: profile.id,
        cityId,
        description: description?.trim() ?? null,
        logoUrl: logoUrl ?? null,
      }).returning();
      squad = createdSquad;
    } catch (insertError) {
      req.log.error({ insertError, profileId: profile.id }, "Failed to insert squad");
      res.status(500).json({ error: "insert_failed", message: "Failed to create squad" });
      return;
    }

    // Auto-add creator as captain member
    try {
      await db.insert(squadMembersTable).values({
        squadId: squad.id,
        userId: profile.id,
        role: "captain",
      });
    } catch (memberError) {
      req.log.error({ memberError, squadId: squad.id }, "Failed to add captain as member");
      // Don't fail the whole operation if member addition fails
    }

    res.status(201).json(formatSquad(squad, 1, true));
  } catch (err) {
    req.log.error({ err }, "Error creating squad");
    res.status(500).json({ error: "internal_error", message: "Failed to create squad" });
  }
});

// ─── POST /squads/:id/join ────────────────────────────────────────────────────
router.post("/squads/:id/join", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const squadId = req.params.id as string;
    const [squad] = await db.select().from(squadsTable)
      .where(eq(squadsTable.id, squadId)).limit(1);
    if (!squad) { res.status(404).json({ error: "not_found", message: "Squad not found" }); return; }

    const [existing] = await db.select({ id: squadMembersTable.id })
      .from(squadMembersTable)
      .where(and(eq(squadMembersTable.squadId, squadId), eq(squadMembersTable.userId, profile.id)))
      .limit(1);

    if (existing) { res.json({ joined: true, alreadyMember: true }); return; }

    await db.insert(squadMembersTable).values({
      squadId,
      userId: profile.id,
      role: "member",
    });

    res.json({ joined: true });
  } catch (err) {
    req.log.error({ err }, "Error joining squad");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /squads/:id/leave ───────────────────────────────────────────────────
router.post("/squads/:id/leave", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const squadId = req.params.id as string;
    const [squad] = await db.select({ captainUserId: squadsTable.captainUserId })
      .from(squadsTable).where(eq(squadsTable.id, squadId)).limit(1);
    if (!squad) { res.status(404).json({ error: "not_found" }); return; }

    if (squad.captainUserId === profile.id) {
      res.status(400).json({ error: "captain_cannot_leave", message: "Captain cannot leave. Transfer captaincy first." });
      return;
    }

    await db.delete(squadMembersTable)
      .where(and(eq(squadMembersTable.squadId, squadId), eq(squadMembersTable.userId, profile.id)));

    res.json({ left: true });
  } catch (err) {
    req.log.error({ err }, "Error leaving squad");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /squads/:id/post ────────────────────────────────────────────────────
router.post("/squads/:id/post", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const squadId = req.params.id as string;
    const { message } = req.body;
    if (!message?.trim()) {
      res.status(400).json({ error: "validation", message: "message is required" });
      return;
    }

    const [membership] = await db.select({ id: squadMembersTable.id })
      .from(squadMembersTable)
      .where(and(eq(squadMembersTable.squadId, squadId), eq(squadMembersTable.userId, profile.id)))
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: "not_member", message: "You must be a member to post" });
      return;
    }

    const [post] = await db.insert(squadPostsTable).values({
      squadId,
      userId: profile.id,
      message: message.trim(),
    }).returning();

    res.status(201).json({ ...post, authorName: profile.fullName, authorAvatar: profile.avatarUrl });
  } catch (err) {
    req.log.error({ err }, "Error posting to squad");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /squads/challenges ───────────────────────────────────────────────────
router.get("/squads/challenges", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const challenges = await db.select().from(squadChallengesTable)
      .orderBy(desc(squadChallengesTable.createdAt)).limit(50);

    res.json(challenges.map((c) => ({
      id: c.id,
      challengerSquadId: c.challengerSquadId,
      opponentSquadId: c.opponentSquadId,
      proposedDate: c.proposedDate,
      sport: c.sport,
      status: c.status,
      hostedMatchId: c.hostedMatchId,
      createdAt: c.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching challenges");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /squads/challenge ───────────────────────────────────────────────────
router.post("/squads/challenge", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const { challengerSquadId, opponentSquadId, proposedDate, sport, proposedSlotId } = req.body;
    if (!challengerSquadId || !opponentSquadId || !proposedDate || !sport) {
      res.status(400).json({ error: "validation", message: "challengerSquadId, opponentSquadId, proposedDate, sport required" });
      return;
    }

    // Verify user is captain/member of challenger squad
    const [membership] = await db.select({ role: squadMembersTable.role })
      .from(squadMembersTable)
      .where(and(eq(squadMembersTable.squadId, challengerSquadId), eq(squadMembersTable.userId, profile.id)))
      .limit(1);

    if (!membership || membership.role !== "captain") {
      res.status(403).json({ error: "forbidden", message: "Only squad captains can issue challenges" });
      return;
    }

    const [challenge] = await db.insert(squadChallengesTable).values({
      challengerSquadId,
      opponentSquadId,
      proposedDate,
      sport,
      proposedSlotId: proposedSlotId ?? null,
    }).returning();

    // Notify opponent captain
    const [opponentSquad] = await db.select({ captainUserId: squadsTable.captainUserId })
      .from(squadsTable).where(eq(squadsTable.id, opponentSquadId)).limit(1);

    const [challengerSquad] = await db.select({ name: squadsTable.name })
      .from(squadsTable).where(eq(squadsTable.id, challengerSquadId)).limit(1);

    if (opponentSquad) {
      await db.insert(notificationsTable).values({
        userId: opponentSquad.captainUserId,
        type: "match_joined" as const,
        title: "Squad Challenge Received!",
        body: `${challengerSquad?.name ?? "A squad"} has challenged your squad to a ${sport} match on ${proposedDate}. Respond now!`,
        referenceId: challenge.id,
      });
    }

    res.status(201).json(challenge);
  } catch (err) {
    req.log.error({ err }, "Error issuing challenge");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /squads/challenge/:id/respond ──────────────────────────────────────
router.post("/squads/challenge/:id/respond", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const challengeId = req.params.id as string;
    const { accept } = req.body;

    const [challenge] = await db.select().from(squadChallengesTable)
      .where(eq(squadChallengesTable.id, challengeId)).limit(1);

    if (!challenge) { res.status(404).json({ error: "not_found" }); return; }
    if (challenge.status !== "pending") {
      res.status(400).json({ error: "already_responded", message: "Challenge already responded to" });
      return;
    }

    const newStatus = accept ? "accepted" : "rejected";
    let hostedMatchId: string | null = null;

    if (accept) {
      // Auto-create a hosted match linked to both squads
      const [activeCity] = await db.select({ id: citiesTable.id })
        .from(citiesTable).where(eq(citiesTable.isActive, true)).limit(1);

      const [challengerSquad] = await db.select()
        .from(squadsTable).where(eq(squadsTable.id, challenge.challengerSquadId)).limit(1);

      // Find a slot if proposed
      let slotId: string | null = challenge.proposedSlotId ?? null;
      let venueId: string | null = null;
      if (slotId) {
        const [slot] = await db.select({ venueId: slotsTable.venueId })
          .from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
        venueId = slot?.venueId ?? null;
      }

      if (challengerSquad && venueId && slotId) {
        const [match] = await db.insert(hostedMatchesTable).values({
          hostUserId: challengerSquad.captainUserId,
          venueId,
          slotId,
          sport: challenge.sport,
          date: challenge.proposedDate,
          startTime: "09:00",
          endTime: "10:00",
          skillLevel: "intermediate",
          totalPlayers: 10,
          minPlayers: 6,
          currentPlayers: 0,
          reserveFee: "0",
          finalFeePerPlayer: "0",
          totalVenueCost: "0",
          status: "open",
        }).returning();
        hostedMatchId = match.id;

        // Auto-post achievement
        setImmediate(() => {
          createAchievementPostForSquadChallengeWin(
            profile.id, challengerSquad.name, challenge.sport, challenge.challengerSquadId,
          ).catch(() => null);
        });
      }
    }

    const [updated] = await db.update(squadChallengesTable)
      .set({ status: newStatus as any, hostedMatchId, updatedAt: new Date() })
      .where(eq(squadChallengesTable.id, challengeId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error responding to challenge");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
