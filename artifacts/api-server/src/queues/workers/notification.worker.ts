/**
 * Phase 8 — Notification Worker
 *
 * Consumes jobs from the "notifications" queue and dispatches WhatsApp / email
 * messages using the existing provider integrations.
 *
 * Design:
 *  - DB-state recheck on every job (idempotency — skip if already sent)
 *  - 4xx provider errors are terminal (mark exhausted, no retry)
 *  - 5xx / network errors: throw → BullMQ retries with exponential backoff + jitter
 *  - Rate limited: 30 jobs / 10s window (WhatsApp burst protection)
 *  - On exhaustion: mark log exhausted, write job_executions audit row
 *
 * Job payload schema:
 * {
 *   logId:          string  — notification_dispatch_logs.id
 *   channel:        "whatsapp" | "email"
 *   destination:    string  — phone or email address
 *   rendered:       { body: string; subject?: string; html?: string }
 *   idempotencyKey: string
 *   referenceId?:   string
 * }
 */

import { Worker, type Job } from "bullmq";
import { db } from "@workspace/db";
import { notificationDispatchLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getWorkerConnection } from "../redis";
import { isRetryableNotificationError, CONCURRENCY } from "../retry-policies";
import { writeJobProcessing, writeJobComplete, writeJobFailed, writeJobExhausted } from "../job-executions";
import { sendWhatsApp, sendEmail, type NotificationJobPayload } from "../../lib/notifications";
import { logger } from "../../lib/logger";

async function processNotificationJob(job: Job<NotificationJobPayload>): Promise<void> {
  const { logId, channel, destination, rendered, executionId } = job.data;
  const startedAt = Date.now();

  await writeJobProcessing(executionId ?? "");

  // ─── DB Recheck: idempotency ──────────────────────────────────────────────
  const [log] = await db
    .select({ id: notificationDispatchLogsTable.id, status: notificationDispatchLogsTable.status })
    .from(notificationDispatchLogsTable)
    .where(eq(notificationDispatchLogsTable.id, logId))
    .limit(1);

  if (!log) {
    logger.warn({ logId, channel }, "Notification log not found — skipping");
    await writeJobComplete(executionId ?? "", Date.now() - startedAt);
    return;
  }

  if (log.status === "sent") {
    logger.debug({ logId, channel }, "Notification already sent — skipping (idempotent)");
    await writeJobComplete(executionId ?? "", Date.now() - startedAt);
    return;
  }

  if (log.status === "exhausted") {
    logger.debug({ logId, channel }, "Notification exhausted — skipping");
    await writeJobComplete(executionId ?? "", Date.now() - startedAt);
    return;
  }

  // ─── Dispatch ─────────────────────────────────────────────────────────────
  let success = false;
  let errorMsg: string | undefined;

  try {
    if (channel === "whatsapp") {
      const result = await sendWhatsApp(destination, rendered.body);
      success = result.success;
      errorMsg = result.error;
    } else if (channel === "email") {
      const result = await sendEmail(
        destination,
        rendered.subject ?? "Matchpit",
        rendered.html ?? rendered.body
      );
      success = result.success;
      errorMsg = result.error;
    }
  } catch (err: any) {
    errorMsg = err?.message ?? "dispatch_error";
  }

  // ─── Handle outcome ───────────────────────────────────────────────────────
  if (success) {
    await db
      .update(notificationDispatchLogsTable)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(notificationDispatchLogsTable.id, logId));
    await writeJobComplete(executionId ?? "", Date.now() - startedAt);
    return;
  }

  // Classify error: 4xx → terminal exhaustion; 5xx / network → retryable
  const retryable = isRetryableNotificationError(errorMsg ?? "");

  if (!retryable || job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
    // Terminal: mark exhausted
    await db
      .update(notificationDispatchLogsTable)
      .set({ status: "exhausted", lastError: errorMsg, updatedAt: new Date() })
      .where(eq(notificationDispatchLogsTable.id, logId));
    await writeJobExhausted(executionId ?? "", new Error(errorMsg ?? "unknown"), job.attemptsMade + 1);
    logger.warn({ logId, channel, errorMsg }, "Notification exhausted — no further retries");
    return; // Do NOT throw — job is intentionally terminal
  }

  // Retryable: update error on log, throw to trigger BullMQ retry
  await db
    .update(notificationDispatchLogsTable)
    .set({
      retryCount: job.attemptsMade + 1,
      lastError: errorMsg,
      updatedAt: new Date(),
    })
    .where(eq(notificationDispatchLogsTable.id, logId));

  await writeJobFailed(executionId ?? "", new Error(errorMsg ?? "unknown"), job.attemptsMade + 1);

  throw new Error(`Notification dispatch failed (retryable): ${errorMsg}`);
}

// ─── Worker export ────────────────────────────────────────────────────────────

let _worker: Worker | null = null;

export function createNotificationWorker(): Worker {
  if (_worker) return _worker;

  _worker = new Worker<NotificationJobPayload>(
    "notifications",
    processNotificationJob,
    {
      connection:      getWorkerConnection(),
      concurrency:     CONCURRENCY.notifications,
      stalledInterval: 30_000,
      maxStalledCount: 2,
      lockDuration:    30_000,
      // Rate limiter: 30 dispatches per 10s window (WhatsApp burst protection)
      limiter: {
        max:      30,
        duration: 10_000,
      },
    }
  );

  _worker.on("completed", (job) => {
    logger.info({ jobId: job.id, channel: job.data.channel }, "Notification job completed");
  });

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "Notification job failed");
  });

  _worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Notification job stalled");
  });

  return _worker;
}

export async function closeNotificationWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
