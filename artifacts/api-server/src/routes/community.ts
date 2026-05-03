import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  communityPostsTable,
  communityPostCommentsTable,
  communityPostLikesTable,
  profilesTable,
  citiesTable,
} from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { checkPostRateLimit } from "../lib/moderation";
import { trackEvent, EVENTS } from "../lib/analytics";

const router: IRouter = Router();

// ─── GET /community/feed ──────────────────────────────────────────────────────
router.get("/community/feed", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Number(req.query.limit ?? 20));
    const offset = (page - 1) * limit;
    const sport = req.query.sport as string | undefined;
    const type = req.query.type as string | undefined;

    // Get active city for filtering
    const [activeCity] = await db.select({ id: citiesTable.id })
      .from(citiesTable).where(eq(citiesTable.isActive, true)).limit(1);

    const posts = await db.select({
      post: communityPostsTable,
      authorName: profilesTable.fullName,
      authorAvatar: profilesTable.avatarUrl,
      authorTrust: profilesTable.trustScore,
    })
      .from(communityPostsTable)
      .leftJoin(profilesTable, eq(communityPostsTable.userId, profilesTable.id))
      .where(and(
        activeCity ? eq(communityPostsTable.cityId, activeCity.id) : undefined,
        sport ? sql`${communityPostsTable.sport} = ${sport}` : undefined,
        type ? sql`${communityPostsTable.type} = ${type}::community_post_type` : undefined,
      ))
      .orderBy(desc(communityPostsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      posts: posts.map(({ post, authorName, authorAvatar, authorTrust }) => ({
        id: post.id,
        userId: post.userId,
        authorName: authorName ?? "Player",
        authorAvatar: authorAvatar ?? null,
        authorTrustScore: Number(authorTrust ?? 100),
        cityId: post.cityId,
        type: post.type,
        caption: post.caption,
        imageUrl: post.imageUrl,
        relatedMatchId: post.relatedMatchId,
        relatedVenueId: post.relatedVenueId,
        relatedSquadId: post.relatedSquadId,
        sport: post.sport,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        createdAt: post.createdAt.toISOString(),
      })),
      page,
      hasMore: posts.length === limit,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching community feed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /community/:postId/comments ─────────────────────────────────────────
router.get("/community/:postId/comments", async (req, res) => {
  try {
    const postId = req.params.postId as string;
    const comments = await db.select({
      comment: communityPostCommentsTable,
      authorName: profilesTable.fullName,
      authorAvatar: profilesTable.avatarUrl,
    })
      .from(communityPostCommentsTable)
      .leftJoin(profilesTable, eq(communityPostCommentsTable.userId, profilesTable.id))
      .where(eq(communityPostCommentsTable.postId, postId))
      .orderBy(desc(communityPostCommentsTable.createdAt))
      .limit(50);

    res.json(comments.map(({ comment, authorName, authorAvatar }) => ({
      id: comment.id,
      postId: comment.postId,
      userId: comment.userId,
      authorName: authorName ?? "Player",
      authorAvatar: authorAvatar ?? null,
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching comments");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /community/post ─────────────────────────────────────────────────────
router.post("/community/post", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const { caption, type = "text", imageUrl, sport, relatedMatchId, relatedVenueId } = req.body;
    if (!caption?.trim()) {
      res.status(400).json({ error: "validation", message: "caption is required" });
      return;
    }

    const allowed = await checkPostRateLimit(profile.id);
    if (!allowed) {
      res.status(429).json({ error: "rate_limited", message: "You've posted too many times today. Try again tomorrow." });
      return;
    }

    const [activeCity] = await db.select({ id: citiesTable.id })
      .from(citiesTable).where(eq(citiesTable.isActive, true)).limit(1);

    const [post] = await db.insert(communityPostsTable).values({
      userId: profile.id,
      cityId: activeCity?.id ?? null,
      type: type as any,
      caption: caption.trim(),
      imageUrl: imageUrl ?? null,
      sport: sport ?? null,
      relatedMatchId: relatedMatchId ?? null,
      relatedVenueId: relatedVenueId ?? null,
    }).returning();

    setImmediate(() => trackEvent(EVENTS.COMMUNITY_POST_CREATED, profile.id, { type, sport }));

    res.status(201).json({ ...post, authorName: profile.fullName, authorAvatar: profile.avatarUrl });
  } catch (err) {
    req.log.error({ err }, "Error creating post");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /community/comment ──────────────────────────────────────────────────
router.post("/community/comment", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const { postId, comment } = req.body;
    if (!postId || !comment?.trim()) {
      res.status(400).json({ error: "validation", message: "postId and comment are required" });
      return;
    }

    const [newComment] = await db.insert(communityPostCommentsTable).values({
      postId,
      userId: profile.id,
      comment: comment.trim(),
    }).returning();

    // Increment comment count
    await db.update(communityPostsTable)
      .set({ commentsCount: sql`${communityPostsTable.commentsCount} + 1` })
      .where(eq(communityPostsTable.id, postId));

    res.status(201).json({ ...newComment, authorName: profile.fullName });
  } catch (err) {
    req.log.error({ err }, "Error adding comment");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /community/like ─────────────────────────────────────────────────────
router.post("/community/like", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const { postId } = req.body;
    if (!postId) { res.status(400).json({ error: "validation", message: "postId required" }); return; }

    const [existing] = await db.select({ id: communityPostLikesTable.id })
      .from(communityPostLikesTable)
      .where(and(eq(communityPostLikesTable.postId, postId), eq(communityPostLikesTable.userId, profile.id)))
      .limit(1);

    if (existing) { res.json({ liked: true, alreadyLiked: true }); return; }

    await db.insert(communityPostLikesTable).values({ postId, userId: profile.id });
    await db.update(communityPostsTable)
      .set({ likesCount: sql`${communityPostsTable.likesCount} + 1` })
      .where(eq(communityPostsTable.id, postId));

    res.json({ liked: true });
  } catch (err) {
    req.log.error({ err }, "Error liking post");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── DELETE /community/like ───────────────────────────────────────────────────
router.delete("/community/like", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }

    const postId = req.query.postId as string;
    if (!postId) { res.status(400).json({ error: "validation", message: "postId required" }); return; }

    await db.delete(communityPostLikesTable)
      .where(and(eq(communityPostLikesTable.postId, postId), eq(communityPostLikesTable.userId, profile.id)));

    await db.update(communityPostsTable)
      .set({ likesCount: sql`GREATEST(${communityPostsTable.likesCount} - 1, 0)` })
      .where(eq(communityPostsTable.id, postId));

    res.json({ unliked: true });
  } catch (err) {
    req.log.error({ err }, "Error unliking post");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /community/stats — Jaipur live counters ──────────────────────────────
router.get("/community/stats", async (req, res) => {
  try {
    const venueRes = await db.execute(sql`SELECT COUNT(*)::int AS c FROM venues WHERE is_approved = true`);
    const matchRes = await db.execute(sql`SELECT COUNT(*)::int AS c FROM hosted_matches`);
    const playerRes = await db.execute(sql`SELECT COUNT(*)::int AS c FROM profiles`);
    const walletRes = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric), 0)::numeric AS c FROM wallet_ledger WHERE type = 'credit'`);

    res.json({
      venues: Number((venueRes.rows[0] as any)?.c ?? 0),
      matchesHosted: Number((matchRes.rows[0] as any)?.c ?? 0),
      playersJoined: Number((playerRes.rows[0] as any)?.c ?? 0),
      walletRewardsDistributed: Number((walletRes.rows[0] as any)?.c ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching community stats");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
