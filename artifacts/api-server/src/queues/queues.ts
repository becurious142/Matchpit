/**
 * Phase 8 — BullMQ Queue Factory
 *
 * Creates all 6 application queues with per-queue:
 *  - retry policies
 *  - job timeouts
 *  - retention limits (removeOnComplete / removeOnFail)
 *  - optional rate limiters
 *
 * Queue instances are singletons — created once and reused.
 * The same Queue instance is used for both enqueue (API) and inspection (monitoring).
 *
 * Worker setup (consumption) is done separately in registry.ts.
 */

import { Queue } from "bullmq";
import { getQueueConnection } from "./redis";
import { RETRY_POLICIES, JOB_TIMEOUTS, buildBackoff, type QueueName } from "./retry-policies";

// ─── Retention limits ─────────────────────────────────────────────────────────

/** Keep last N completed jobs, max 24h age — prevents Redis bloat */
const REMOVE_ON_COMPLETE = { count: 1000, age: 24 * 3600 };

/** Keep last N failed jobs, max 7 days — DLQ inspection window */
const REMOVE_ON_FAIL = { count: 5000, age: 7 * 24 * 3600 };

// ─── Queue singletons ─────────────────────────────────────────────────────────

const _queues = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  if (!_queues.has(name)) {
    const policy = RETRY_POLICIES[name];
    const queue = new Queue(name, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts:          policy.attempts,
        backoff:           buildBackoff(policy),
        removeOnComplete:  REMOVE_ON_COMPLETE,
        removeOnFail:      REMOVE_ON_FAIL,
      },
    });
    _queues.set(name, queue);
  }
  return _queues.get(name)!;
}

// ─── Named queue exports ──────────────────────────────────────────────────────

/** Notification dispatch queue (WhatsApp + email). Rate-limited to 30/10s. */
export const notificationsQueue = () => getQueue("notifications");

/** Razorpay gateway refund queue. */
export const refundsQueue = () => getQueue("refunds");

/** Webhook post-payment side effects (payouts, rewards, analytics). */
export const webhookSideEffectsQueue = () => getQueue("webhook-side-effects");

/** Settlement batch chunked processing. */
export const settlementsQueue = () => getQueue("settlements");

/** Cron job execution queue. */
export const cronJobsQueue = () => getQueue("cron-jobs");

/** Admin data export queue. */
export const exportsQueue = () => getQueue("exports");

/** Async fraud detection and risk evaluations. */
export const riskEvaluationsQueue = () => getQueue("risk-evaluations");

/** Cache refresh for discovery elements. */
export const cacheRefreshQueue = () => getQueue("cache-refresh");

/** Presence garbage collection. */
export const presenceGcQueue = () => getQueue("presence-gc");

/** Financial reconciliation queue. */
export const reconciliationQueue = () => getQueue("reconciliation");

/** Get any queue by name (for monitoring API). */
export function getQueueByName(name: QueueName): Queue {
  return getQueue(name);
}

/** All queue names — used for health checks and monitoring. */
export const ALL_QUEUE_NAMES: QueueName[] = [
  "notifications",
  "refunds",
  "webhook-side-effects",
  "settlements",
  "cron-jobs",
  "exports",
  "risk-evaluations",
  "cache-refresh",
  "presence-gc",
  "reconciliation",
];

/** Map of all instantiated queues, useful for bulk operations like pause/resume */
export const allQueues = _queues;

/** Gracefully close all queue connections. */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled(
    Array.from(_queues.values()).map((q) => q.close())
  );
  _queues.clear();
}
