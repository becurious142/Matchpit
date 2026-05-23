import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("ioredis", () => {
  return {
    Redis: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      ping: vi.fn().mockResolvedValue("PONG"),
      quit: vi.fn().mockResolvedValue("OK")
    }))
  };
});

vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation((name, opts) => ({
      name,
      defaultJobOptions: opts?.defaultJobOptions || { removeOnComplete: {}, removeOnFail: {} },
      add: vi.fn().mockResolvedValue({ id: "job-1" })
    })),
    Worker: vi.fn().mockImplementation((name, processFn) => ({
      name,
      processFn,
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    }))
  };
});

import { createNotificationWorker, closeNotificationWorker, type NotificationJobPayload } from "../../src/queues/workers/notification.worker";
import { db } from "@workspace/db";
import { notificationDispatchLogsTable, jobExecutionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as notificationsLib from "../../src/lib/notifications";

// Mock the provider send functions
vi.mock("../../src/lib/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/notifications")>();
  return {
    ...actual,
    sendWhatsApp: vi.fn(),
    sendEmail: vi.fn(),
  };
});

describe("Phase 8A: Notification Worker", () => {
  let worker: any;

  beforeEach(async () => {
    await db.delete(notificationDispatchLogsTable);
    await db.delete(jobExecutionsTable);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeNotificationWorker();
  });

  function createMockJob(payload: Partial<NotificationJobPayload>, attemptsMade = 0) {
    return {
      id: "job-123",
      name: `send-${payload.channel || "whatsapp"}`,
      data: payload,
      opts: { attempts: 3 },
      attemptsMade,
    } as any;
  }

  async function processJob(job: any) {
    // BullMQ workers run processors. We can extract the processor function from the worker instance.
    worker = createNotificationWorker();
    const processor = (worker as any).processFn;
    await processor(job);
  }

  it("skips processing if DB status is already 'sent' (idempotency)", async () => {
    const testUserId = crypto.randomUUID();
    const [log] = await db.insert(notificationDispatchLogsTable).values({
      userId: testUserId,
      channel: "whatsapp",
      destination: "1234567890",
      templateKey: "test",
      status: "sent",
      idempotencyKey: "idem-1",
    }).returning();

    const job = createMockJob({
      logId: log.id,
      channel: "whatsapp",
      destination: "1234567890",
      rendered: { body: "Hello" },
      idempotencyKey: "idem-1",
    });

    await processJob(job);

    expect(notificationsLib.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("calls sendWhatsApp and updates DB on success", async () => {
    const testUserId = crypto.randomUUID();
    const [log] = await db.insert(notificationDispatchLogsTable).values({
      userId: testUserId,
      channel: "whatsapp",
      destination: "1234567890",
      templateKey: "test",
      status: "queued",
      idempotencyKey: "idem-2",
    }).returning();

    const execId = crypto.randomUUID();
    await db.insert(jobExecutionsTable).values({
      id: execId,
      queueName: "notifications",
      jobType: "send-whatsapp",
      status: "pending",
    });

    vi.mocked(notificationsLib.sendWhatsApp).mockResolvedValue({ success: true });

    const job = createMockJob({
      logId: log.id,
      channel: "whatsapp",
      destination: "1234567890",
      rendered: { body: "Hello" },
      idempotencyKey: "idem-2",
      executionId: execId,
    });

    await processJob(job);

    expect(notificationsLib.sendWhatsApp).toHaveBeenCalledWith("1234567890", "Hello");

    const [updatedLog] = await db.select().from(notificationDispatchLogsTable).where(eq(notificationDispatchLogsTable.id, log.id));
    expect(updatedLog.status).toBe("sent");

    const [execRow] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, execId));
    expect(execRow.status).toBe("completed");
  });

  it("marks as exhausted immediately on 4xx error (no retry)", async () => {
    const testUserId = crypto.randomUUID();
    const [log] = await db.insert(notificationDispatchLogsTable).values({
      userId: testUserId,
      channel: "whatsapp",
      destination: "invalid",
      templateKey: "test",
      status: "queued",
      idempotencyKey: "idem-3",
    }).returning();

    vi.mocked(notificationsLib.sendWhatsApp).mockResolvedValue({ success: false, error: "HTTP 400 Bad Request" });

    const job = createMockJob({
      logId: log.id,
      channel: "whatsapp",
      destination: "invalid",
      rendered: { body: "Hello" },
      idempotencyKey: "idem-3",
    });

    await processJob(job); // Should not throw! Terminal failure returns cleanly to BullMQ so it doesn't retry

    const [updatedLog] = await db.select().from(notificationDispatchLogsTable).where(eq(notificationDispatchLogsTable.id, log.id));
    expect(updatedLog.status).toBe("exhausted");
  });

  it("throws error for 5xx to trigger BullMQ retry", async () => {
    const testUserId = crypto.randomUUID();

    const [log] = await db.insert(notificationDispatchLogsTable).values({
      userId: testUserId,
      channel: "email",
      destination: "test@example.com",
      templateKey: "test",
      status: "queued",
      idempotencyKey: "idem-4",
    }).returning();

    vi.mocked(notificationsLib.sendEmail).mockResolvedValue({ success: false, error: "Network timeout" });

    const job = createMockJob({
      logId: log.id,
      channel: "email",
      destination: "test@example.com",
      rendered: { body: "Hello", subject: "Subj" },
      idempotencyKey: "idem-4",
    });

    await expect(processJob(job)).rejects.toThrow("Notification dispatch failed (retryable): Network timeout");

    const [updatedLog] = await db.select().from(notificationDispatchLogsTable).where(eq(notificationDispatchLogsTable.id, log.id));
    expect(updatedLog.retryCount).toBe(1);
    expect(updatedLog.lastError).toBe("Network timeout");
  });
});
