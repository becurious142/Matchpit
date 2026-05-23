import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getQueueConnection } from "../queues/redis";

const router = Router();

router.get("/health/live", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/health/ready", async (req, res) => {
  try {
    // Check DB
    await db.execute(sql`SELECT 1`);
    
    // Check Redis
    const redis = getQueueConnection();
    await redis.ping();

    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", message: "Dependencies not ready" });
  }
});

export const healthProbesRouter = router;
