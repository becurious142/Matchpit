/**
 * Phase 8 — Per-queue retry policies and error classification.
 */

export type QueueName =
  | "notifications"
  | "refunds"
  | "webhook-side-effects"
  | "settlements"
  | "cron-jobs"
  | "exports"
  | "risk-evaluations"
  | "cache-refresh"
  | "presence-gc"
  | "reconciliation";

export interface RetryPolicy {
  attempts: number;
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };
  /** Add random jitter up to 20% of delay to avoid thundering herd */
  jitter?: boolean;
}

export const RETRY_POLICIES: Record<QueueName, RetryPolicy> = {
  notifications: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    jitter: true,
  },
  refunds: {
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    jitter: true,
  },
  "webhook-side-effects": {
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    jitter: true,
  },
  settlements: {
    attempts: 3,
    backoff: { type: "fixed", delay: 5_000 },
  },
  "cron-jobs": {
    attempts: 1,
  },
  exports: {
    attempts: 1,
  },
  "risk-evaluations": {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
  "cache-refresh": {
    attempts: 2,
    backoff: { type: "exponential", delay: 2_000 },
  },
  "presence-gc": {
    attempts: 1,
  },
  reconciliation: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
  },
};

/**
 * Job timeout per queue (milliseconds).
 * BullMQ kills jobs that exceed this duration.
 */
export const JOB_TIMEOUTS: Record<QueueName, number> = {
  notifications:          30_000,
  refunds:                60_000,
  "webhook-side-effects": 60_000,
  settlements:           120_000,
  "cron-jobs":           300_000,
  exports:               600_000,
  "risk-evaluations":    30_000,
  "cache-refresh":       10_000,
  "presence-gc":         10_000,
  reconciliation:        60_000,
};

/**
 * Concurrency per queue (number of simultaneous jobs per worker instance).
 */
export const CONCURRENCY: Record<QueueName, number> = {
  notifications:          10,
  refunds:                 3,
  "webhook-side-effects":  5,
  settlements:             1,
  "cron-jobs":             1,
  exports:                 2,
  "risk-evaluations":      5,
  "cache-refresh":         5,
  "presence-gc":           1,
  reconciliation:          2,
};

// ─── Provider error classification ────────────────────────────────────────────

/**
 * Returns true if the notification provider error is worth retrying.
 *
 * DO NOT retry:
 *   - 4xx: invalid recipient, bad phone number, auth failure (will never succeed)
 *
 * DO retry:
 *   - 5xx: provider-side errors
 *   - Network errors, timeouts
 */
export function isRetryableNotificationError(error: string): boolean {
  // 4xx HTTP errors are terminal — don't retry
  if (/HTTP\s+4\d{2}/.test(error)) return false;
  if (error.includes("provider_not_configured")) return false;
  return true;
}

/**
 * Returns true if the Razorpay refund error is transient and worth retrying.
 */
export function isRetryableRefundError(error: string): boolean {
  if (/HTTP\s+4\d{2}/.test(error)) return false;
  if (error.includes("Payment not found")) return false;
  return true;
}

// ─── BullMQ backoff with jitter ───────────────────────────────────────────────

/**
 * Build BullMQ-compatible backoff config from a RetryPolicy.
 * Applies up to 20% jitter when policy.jitter = true.
 */
export function buildBackoff(policy: RetryPolicy): { type: string; delay: number } | undefined {
  if (!policy.backoff) return undefined;
  const base = policy.backoff.delay;
  const jitter = policy.jitter ? Math.floor(Math.random() * base * 0.2) : 0;
  return { type: policy.backoff.type, delay: base + jitter };
}
