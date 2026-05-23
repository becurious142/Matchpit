import { env } from "../config/env";
import { Router, type IRouter } from "express";
import { isRedisHealthy } from "../queues/redis";
import { ALL_QUEUE_NAMES, getQueueByName } from "../queues/queues";

const router: IRouter = Router();

import { pool } from "@workspace/db";

// ─── Basic health (used by deployment platform) ───────────────────────────────

router.get("/health/live", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

router.get("/health/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    if (!(await isRedisHealthy())) throw new Error("Redis down");
    res.json({ status: "ready" });
  } catch (err: any) {
    res.status(503).json({ status: "not_ready", error: err.message });
  }
});

router.get("/health/dependencies", async (req, res) => {
  const deps = { database: "down", redis: "down", bullmq: "down" };
  try {
    await pool.query("SELECT 1");
    deps.database = "up";
  } catch (e) {}
  
  if (await isRedisHealthy()) {
    deps.redis = "up";
    deps.bullmq = "up"; // BullMQ uses Redis
  }
  
  const allUp = Object.values(deps).every(s => s === "up");
  res.status(allUp ? 200 : 503).json({ dependencies: deps });
});

router.get("/healthz", (_req, res) => { res.json({ status: "ok" }); });
router.get("/health", (_req, res) => { res.json({ status: "ok" }); });

// ─── Worker / queue health (Phase 8) ─────────────────────────────────────────

/**
 * GET /health/worker
 *
 * Returns Redis connectivity and per-queue depths.
 * Returns 200 if Redis is connected.
 * Returns 503 if Redis is unreachable (queue workers unavailable).
 */
router.get("/health/worker", async (_req: any, res: any) => {
  const workersEnabled = env.ENABLE_QUEUE_WORKERS;

  if (!workersEnabled) {
    return res.json({
      status: "disabled",
      message: "Queue workers disabled via ENABLE_QUEUE_WORKERS=false",
      redis: "skipped",
      queues: {},
    });
  }

  const redisOk = await isRedisHealthy();

  if (!redisOk) {
    return res.status(503).json({
      status: "degraded",
      redis: "unreachable",
      queues: {},
    });
  }

  // Fetch queue depths for all queues
  const queueStats: Record<string, object> = {};
  try {
    for (const name of ALL_QUEUE_NAMES) {
      const queue = getQueueByName(name);
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      queueStats[name] = counts;
    }
  } catch (err: any) {
    return res.status(503).json({
      status: "degraded",
      redis: "connected",
      error: err?.message ?? "Failed to fetch queue stats",
      queues: queueStats,
    });
  }

  return res.json({
    status: "ok",
    redis: "connected",
    queues: queueStats,
    timestamp: new Date().toISOString(),
  });
});

export default router;
