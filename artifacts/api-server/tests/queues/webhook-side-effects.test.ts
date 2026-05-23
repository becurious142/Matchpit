import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@workspace/db";
import { paymentWebhookEventsTable, jobExecutionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { processWebhookSideEffects } from "../../src/queues/workers/webhook-side-effects.worker";
import { runPostPaymentSideEffects } from "../../src/lib/post-payment";
import crypto from "crypto";

// Mock the post-payment side effects so we don't actually hit Razorpay/DB
vi.mock("../../src/lib/post-payment", () => ({
  runPostPaymentSideEffects: vi.fn().mockResolvedValue(undefined),
}));

describe("Phase 8B: Webhook Side Effects Worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it("skips processing if event is not in 'processed' state", async () => {
    const testEventId = crypto.randomUUID();
    
    // Insert an event that is 'pending'
    await db.insert(paymentWebhookEventsTable).values({
      id: testEventId,
      providerEventId: `test_order_${crypto.randomUUID()}::payment.captured`,
      provider: "razorpay",
      eventType: "payment.captured",
      payload: {},
      processingStatus: "pending", // NOT processed
    });

    const jobMock = {
      id: "job-1",
      data: {
        eventId: testEventId,
      },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    await expect(processWebhookSideEffects(jobMock)).rejects.toThrow(/not fully processed by API yet/);
  });

  it("calls runPostPaymentSideEffects if event is 'processed' and ctx is provided", async () => {
    const testEventId = crypto.randomUUID();
    
    // Insert an event that is 'processed'
    await db.insert(paymentWebhookEventsTable).values({
      id: testEventId,
      providerEventId: `test_order2_${crypto.randomUUID()}::payment.captured`,
      provider: "razorpay",
      eventType: "payment.captured",
      payload: {},
      processingStatus: "processed",
      processedAt: new Date(),
    });

    const ctx = {
      paymentId: "pay-1",
      userId: "user-1",
      type: "match_join",
      referenceId: "match-1",
      amount: 500,
      grossAmount: 500,
    };

    const jobMock = {
      id: "job-2",
      data: {
        eventId: testEventId,
        ctx,
      },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    await processWebhookSideEffects(jobMock);

    expect(runPostPaymentSideEffects).toHaveBeenCalledWith(ctx);
  });

  it("updates job_executions audit table on success", async () => {
    const testEventId = crypto.randomUUID();
    
    await db.insert(paymentWebhookEventsTable).values({
      id: testEventId,
      providerEventId: `test_order3_${crypto.randomUUID()}::payment.captured`,
      provider: "razorpay",
      eventType: "payment.captured",
      payload: {},
      processingStatus: "processed",
    });

    // Create a dummy job execution record
    const [exec] = await db.insert(jobExecutionsTable).values({
      queueName: "webhook-side-effects",
      jobType: "webhook-process",
      status: "pending",
    }).returning();

    const jobMock = {
      id: "job-3",
      data: {
        eventId: testEventId,
        executionId: exec.id,
      },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    await processWebhookSideEffects(jobMock);

    // Verify it was marked completed
    const [updatedExec] = await db.select().from(jobExecutionsTable).where(eq(jobExecutionsTable.id, exec.id));
    expect(updatedExec.status).toBe("completed");
    expect(updatedExec.durationMs).toBeDefined();
  });
});
