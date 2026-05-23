import { Worker, type Job } from "bullmq";
import { getWorkerConnection } from "../redis";
import { logger } from "../../lib/logger";
import { db } from "@workspace/db";
import { paymentWebhookEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeJobProcessing, writeJobComplete, writeJobFailed, writeJobExhausted } from "../job-executions";
import { runPostPaymentSideEffects, type PostPaymentContext } from "../../lib/post-payment";

export interface WebhookSideEffectsPayload {
  eventId: string; // The ID of the payment_webhook_events row
  executionId?: string; // Phase 8 audit ID
  ctx?: PostPaymentContext; // Context passed directly from webhook
}

export async function processWebhookSideEffects(job: Job<WebhookSideEffectsPayload>) {
  const { eventId, executionId, ctx } = job.data;
  
  if (executionId) await writeJobProcessing(executionId);

  try {
    // 1. Fetch the event
    const [event] = await db
      .select()
      .from(paymentWebhookEventsTable)
      .where(eq(paymentWebhookEventsTable.id, eventId));

    if (!event) {
      throw new Error(`Webhook event not found in DB: ${eventId}`);
    }

    if (event.processingStatus !== "processed") {
      // The synchronous handler hasn't committed yet or it failed.
      // We should retry (throw error) so BullMQ backs off.
      throw new Error(`Webhook event ${eventId} not fully processed by API yet. Status is ${event.processingStatus}`);
    }

    // 2. Perform side effects (Rewards, Notifications, Emails, Cache invalidation)
    if (ctx) {
      await runPostPaymentSideEffects(ctx);
    } else {
      logger.warn({ eventId }, "No ctx provided in webhook side effects payload, skipping");
    }

    if (executionId) {
      // Record duration
      const duration = Date.now() - job.timestamp;
      await writeJobComplete(executionId, duration);
    }
  } catch (err: any) {
    logger.error({ err, jobId: job.id, eventId }, "Webhook side effects worker failed");
    
    if (executionId) {
      const isTerminal = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;
      if (isTerminal) {
        await writeJobExhausted(executionId, err, job.attemptsMade + 1);
      } else {
        await writeJobFailed(executionId, err, job.attemptsMade + 1);
      }
    }
    
    // Bubble up so BullMQ retries
    throw err;
  }
}

export function createWebhookSideEffectsWorker() {
  const worker = new Worker<WebhookSideEffectsPayload>(
    "webhook-side-effects",
    processWebhookSideEffects,
    {
      connection: getWorkerConnection(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "webhook-side-effects job failed");
  });

  return worker;
}

export async function closeWebhookSideEffectsWorker(worker: Worker) {
  await worker.close();
}
