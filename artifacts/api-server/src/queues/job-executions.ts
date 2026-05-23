/**
 * Phase 8 — job_executions write-ahead audit helper.
 *
 * Provides financial-grade audit trail for all queue jobs beyond
 * BullMQ's ephemeral Redis state.
 *
 * Usage pattern:
 *   const execId = await writeJobStart(...);
 *   // ... do work ...
 *   await writeJobComplete(execId, durationMs);
 *   // OR on failure:
 *   await writeJobFailed(execId, error, attempts);
 */

import { db } from "@workspace/db";
import { jobExecutionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "exhausted"
  | "enqueue_failed";

/**
 * Write a pending row BEFORE enqueueing the BullMQ job.
 * If Redis is down and the job is never enqueued, this row surfaces for recovery.
 *
 * @returns executionId for subsequent updates
 */
export async function writeJobStart(
  queueName: string,
  jobType: string,
  bullmqJobId: string | null,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  try {
    const [row] = await db
      .insert(jobExecutionsTable)
      .values({
        queueName,
        jobType,
        bullmqJobId,
        referenceId: referenceId ?? null,
        status: "pending",
        startedAt: new Date(),
        metadata: metadata ?? null,
      })
      .returning({ id: jobExecutionsTable.id });

    return row.id;
  } catch (err) {
    logger.error({ err, queueName, jobType }, "job_executions: writeJobStart failed");
    return ""; // Non-fatal — audit row missing is acceptable
  }
}

/**
 * Mark a job execution as processing (worker has picked it up).
 */
export async function writeJobProcessing(executionId: string): Promise<void> {
  if (!executionId) return;
  try {
    await db
      .update(jobExecutionsTable)
      .set({ status: "processing" })
      .where(eq(jobExecutionsTable.id, executionId));
  } catch (err) {
    logger.error({ err, executionId }, "job_executions: writeJobProcessing failed");
  }
}

/**
 * Mark a job execution as completed successfully.
 */
export async function writeJobComplete(
  executionId: string,
  durationMs: number
): Promise<void> {
  if (!executionId) return;
  try {
    await db
      .update(jobExecutionsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(jobExecutionsTable.id, executionId));
  } catch (err) {
    logger.error({ err, executionId }, "job_executions: writeJobComplete failed");
  }
}

/**
 * Record a job failure (retriable — BullMQ will retry).
 */
export async function writeJobFailed(
  executionId: string,
  error: unknown,
  attempts: number
): Promise<void> {
  if (!executionId) return;
  try {
    const errorPayload =
      error instanceof Error
        ? { message: error.message, stack: error.stack?.slice(0, 2000) }
        : { message: String(error) };

    await db
      .update(jobExecutionsTable)
      .set({
        status: "failed",
        attempts,
        errorPayload,
        completedAt: new Date(),
      })
      .where(eq(jobExecutionsTable.id, executionId));
  } catch (err) {
    logger.error({ err, executionId }, "job_executions: writeJobFailed failed");
  }
}

/**
 * Mark a job as exhausted (max retries reached — no further automatic retries).
 * Surfaces in DLQ and admin monitoring.
 */
export async function writeJobExhausted(
  executionId: string,
  error: unknown,
  attempts: number
): Promise<void> {
  if (!executionId) return;
  try {
    const errorPayload =
      error instanceof Error
        ? { message: error.message, stack: error.stack?.slice(0, 2000) }
        : { message: String(error) };

    await db
      .update(jobExecutionsTable)
      .set({
        status: "exhausted",
        attempts,
        errorPayload,
        completedAt: new Date(),
      })
      .where(eq(jobExecutionsTable.id, executionId));
  } catch (err) {
    logger.error({ err, executionId }, "job_executions: writeJobExhausted failed");
  }
}

/**
 * Mark that the enqueue itself failed (Redis unavailable or network error).
 * The DB record remains with status "enqueue_failed" for recovery tooling.
 */
export async function writeEnqueueFailed(
  executionId: string,
  error: unknown
): Promise<void> {
  if (!executionId) return;
  try {
    const errorPayload =
      error instanceof Error
        ? { message: error.message }
        : { message: String(error) };

    await db
      .update(jobExecutionsTable)
      .set({
        status: "enqueue_failed",
        errorPayload,
        completedAt: new Date(),
      })
      .where(eq(jobExecutionsTable.id, executionId));
  } catch (err) {
    logger.error({ err, executionId }, "job_executions: writeEnqueueFailed failed");
  }
}
