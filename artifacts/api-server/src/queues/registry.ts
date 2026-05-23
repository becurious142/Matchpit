/**
 * Phase 8 — Worker Registry
 *
 * Starts and stops all BullMQ workers.
 * Called from src/worker.ts (separate process from API server).
 */

import { createNotificationWorker, closeNotificationWorker } from "./workers/notification.worker";
import { createRefundWorker, closeRefundWorker } from "./workers/refund.worker";
import { createWebhookSideEffectsWorker, closeWebhookSideEffectsWorker } from "./workers/webhook-side-effects.worker";
import { createSettlementWorker, closeSettlementWorker } from "./workers/settlement.worker";
import { createCronWorker, closeCronWorker } from "./workers/cron.worker";
import { createRiskEvaluationWorker, closeRiskEvaluationWorker } from "./workers/risk-evaluation.worker";
import { logger } from "../lib/logger";

type WorkerHandle = {
  name: string;
  close: () => Promise<void>;
};

const _workers: WorkerHandle[] = [];

/**
 * Start all workers. Called once at worker process startup.
 */
export async function startWorkers(): Promise<void> {
  logger.info("Starting BullMQ workers...");

  // Phase 8A: Notification worker
  const notificationWorker = createNotificationWorker();
  _workers.push({ name: "notifications", close: closeNotificationWorker });

  // Phase 8B workers registered here after implementation
  const refundWorker = createRefundWorker();
  _workers.push({ name: "refunds", close: async () => closeRefundWorker(refundWorker) });
  
  const webhookSideEffectsWorker = createWebhookSideEffectsWorker();
  _workers.push({ name: "webhook-side-effects", close: async () => closeWebhookSideEffectsWorker(webhookSideEffectsWorker) });

  // Phase 8C workers registered here after implementation
  // const settlementWorker = createSettlementWorker();
  // const cronWorker = createCronWorker();

  // Phase 9: Risk engine
  const riskWorker = createRiskEvaluationWorker();
  _workers.push({ name: "risk-evaluations", close: async () => closeRiskEvaluationWorker(riskWorker) });

  logger.info({ workerCount: _workers.length }, "BullMQ workers started");
}

/**
 * Stop all workers gracefully.
 * Waits for in-flight jobs to complete (up to 30s per worker).
 */
export async function stopWorkers(): Promise<void> {
  logger.info("Stopping BullMQ workers...");
  await Promise.allSettled(_workers.map((w) => w.close()));
  _workers.length = 0;
  logger.info("All BullMQ workers stopped");
}
