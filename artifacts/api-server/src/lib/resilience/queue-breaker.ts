import { Job, DelayedError } from "bullmq";
import { CircuitBreaker } from "./provider-health";
import { logger } from "../logger";

/**
 * Wraps a BullMQ job processor with circuit breaker awareness.
 * If the circuit is OPEN, it throws a DelayedError instead of failing,
 * pushing the job back to the delayed queue without consuming a retry attempt.
 */
export async function withQueueBreaker<T>(
  job: Job,
  breaker: CircuitBreaker,
  processFn: () => Promise<T>,
  delayMs: number = 60000 // default 1 min delay if circuit open
): Promise<T> {
  if (breaker.isOpen()) {
    logger.warn({ jobId: job.id, provider: breaker["name"] }, "Delaying job due to OPEN circuit breaker");
    await job.moveToDelayed(Date.now() + delayMs, job.token!);
    throw new DelayedError();
  }

  return await breaker.execute(processFn);
}
