import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import healthRouter from "../../src/routes/health";
import * as redisLib from "../../src/queues/redis";
import * as queuesLib from "../../src/queues/queues";

// Create a minimal express app with the health router
const app = express();
app.use("/", healthRouter);

describe("Phase 8A: Worker Health Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_QUEUE_WORKERS = "true";
  });

  afterEach(() => {
    delete process.env.ENABLE_QUEUE_WORKERS;
  });

  it("returns status ok and queue depths when healthy", async () => {
    // Mock healthy redis
    vi.spyOn(redisLib, "isRedisHealthy").mockResolvedValue(true);

    // Mock queue counts
    const mockCounts = { waiting: 5, active: 2, completed: 10, failed: 1, delayed: 0 };
    const mockQueue = {
      getJobCounts: vi.fn().mockResolvedValue(mockCounts),
    };
    vi.spyOn(queuesLib, "getQueueByName").mockReturnValue(mockQueue as any);
    
    // We export ALL_QUEUE_NAMES, it has 6 queues
    vi.spyOn(queuesLib, "ALL_QUEUE_NAMES", "get").mockReturnValue(["notifications"] as any);

    const res = await request(app).get("/health/worker");
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.redis).toBe("connected");
    expect(res.body.queues.notifications).toEqual(mockCounts);
  });

  it("returns 503 degraded when redis is unreachable", async () => {
    vi.spyOn(redisLib, "isRedisHealthy").mockResolvedValue(false);

    const res = await request(app).get("/health/worker");
    
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.redis).toBe("unreachable");
  });

  it("returns 503 degraded when queue fetching fails", async () => {
    vi.spyOn(redisLib, "isRedisHealthy").mockResolvedValue(true);
    
    const mockQueue = {
      getJobCounts: vi.fn().mockRejectedValue(new Error("Redis disconnected during fetch")),
    };
    vi.spyOn(queuesLib, "getQueueByName").mockReturnValue(mockQueue as any);
    vi.spyOn(queuesLib, "ALL_QUEUE_NAMES", "get").mockReturnValue(["notifications"] as any);

    const res = await request(app).get("/health/worker");
    
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.error).toBe("Redis disconnected during fetch");
  });

  it("returns gracefully skipped when workers are disabled via env", async () => {
    process.env.ENABLE_QUEUE_WORKERS = "false";

    const res = await request(app).get("/health/worker");
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("disabled");
    expect(res.body.redis).toBe("skipped");
  });
});
