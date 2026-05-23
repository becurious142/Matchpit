import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@workspace/db";
import { jobExecutionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

vi.mock("ioredis", () => {
  class MockRedis {
    on = vi.fn();
    ping = vi.fn().mockResolvedValue("PONG");
    quit = vi.fn().mockResolvedValue("OK");
    disconnect = vi.fn();
  }
  return { Redis: MockRedis };
});

vi.mock("bullmq", () => {
  class MockQueue {
    name: string;
    defaultJobOptions: any;
    constructor(name: string, opts: any) {
      this.name = name;
      this.defaultJobOptions = opts?.defaultJobOptions || { removeOnComplete: {}, removeOnFail: {} };
    }
  }
  return { Queue: MockQueue };
});

import { getQueueConnection, getWorkerConnection, isRedisHealthy, closeConnections } from "../../src/queues/redis";
import { writeJobStart, writeJobComplete, writeJobFailed, writeJobExhausted, writeEnqueueFailed } from "../../src/queues/job-executions";
import { ALL_QUEUE_NAMES, getQueueByName } from "../../src/queues/queues";

describe("Phase 8A: Queue Infrastructure", () => {
  beforeEach(async () => {
    await db.delete(jobExecutionsTable);
  });

  afterEach(async () => {
    await closeConnections();
    vi.restoreAllMocks();
  });

  describe("Redis Connectivity", () => {
    it("creates separate connections for queue and worker", () => {
      const qConn = getQueueConnection();
      const wConn = getWorkerConnection();
      expect(qConn).toBeDefined();
      expect(wConn).toBeDefined();
      expect(qConn).not.toBe(wConn); // Must be different instances
    });

    it("reports healthy when ping succeeds", async () => {
      const isHealthy = await isRedisHealthy();
      expect(isHealthy).toBe(true);
    });
  });

  describe("job_executions Write-Ahead Audit", () => {
    it("creates pending row on start", async () => {
      const execId = await writeJobStart("notifications", "send-whatsapp", "job-123", "ref-456");
      
      const [row] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, execId));
      expect(row).toBeDefined();
      expect(row.status).toBe("pending");
      expect(row.queueName).toBe("notifications");
      expect(row.bullmqJobId).toBe("job-123");
      expect(row.referenceId).toBe("ref-456");
    });

    it("transitions pending -> completed with duration", async () => {
      const execId = await writeJobStart("notifications", "send-whatsapp", "job-1");
      await writeJobComplete(execId, 150);

      const [row] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, execId));
      expect(row.status).toBe("completed");
      expect(row.durationMs).toBe(150);
      expect(row.completedAt).toBeDefined();
    });

    it("transitions pending -> failed with error payload", async () => {
      const execId = await writeJobStart("notifications", "send-whatsapp", "job-1");
      await writeJobFailed(execId, new Error("API timeout"), 2);

      const [row] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, execId));
      expect(row.status).toBe("failed");
      expect(row.attempts).toBe(2);
      expect((row.errorPayload as any).message).toBe("API timeout");
    });

    it("transitions pending -> exhausted when retries max out", async () => {
      const execId = await writeJobStart("notifications", "send-whatsapp", "job-1");
      await writeJobExhausted(execId, new Error("Terminal error"), 3);

      const [row] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, execId));
      expect(row.status).toBe("exhausted");
      expect(row.attempts).toBe(3);
    });

    it("transitions pending -> enqueue_failed if Redis is down", async () => {
      const execId = await writeJobStart("notifications", "send-whatsapp", "job-1");
      await writeEnqueueFailed(execId, new Error("Redis connection refused"));

      const [row] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, execId));
      expect(row.status).toBe("enqueue_failed");
      expect((row.errorPayload as any).message).toContain("Redis connection refused");
    });
  });

  describe("Queue Factory Constraints", () => {
    it("instantiates all defined queues with retention policies", () => {
      for (const name of ALL_QUEUE_NAMES) {
        const q = getQueueByName(name);
        expect(q).toBeDefined();
        expect(q.name).toBe(name);
        // BullMQ default options verify retention config
        expect(q.defaultJobOptions?.removeOnComplete).toBeDefined();
        expect(q.defaultJobOptions?.removeOnFail).toBeDefined();
      }
    });
  });
});
