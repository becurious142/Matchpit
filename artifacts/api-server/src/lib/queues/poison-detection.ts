import { Job } from "bullmq";
import { db, queueReplaysTable } from "@workspace/db";
import { logger } from "../logger";

const MAX_FAILURES_BEFORE_POISON = 5;

export const PoisonDetection = {
  /**
   * Evaluates a failed job to determine if it should be quarantined.
   * If attempts reach threshold, it's flagged as poisoned instead of deleted.
   */
  async handleFailure(job: Job, err: Error) {
    if (!job) return;

    if (job.attemptsMade >= MAX_FAILURES_BEFORE_POISON) {
      logger.error({ 
        jobId: job.id, 
        queueName: job.queueName, 
        err: err.message,
        payload: job.data 
      }, "POISON JOB DETECTED: Quarantining job");
      
      // Instead of discarding, we move it to a specific Redis list or DB table.
      // BullMQ handles failed jobs via `removeOnFail` retention. Since we
      // retain failed jobs (REMOVE_ON_FAIL), we just log it critically for now.
      // Admin dashboard can filter jobs with attempts > max as "quarantined".
      
      // We could also formally insert it into a quarantine table here if needed.
    }
  },

  /**
   * Audits a job replay manually initiated by an admin.
   */
  async auditReplay(adminId: string, jobId: string, queueName: string, reason: string) {
    await db.insert(queueReplaysTable).values({
      originalJobId: jobId,
      queueName,
      replayedBy: adminId,
      replayReason: reason
    });
    logger.info({ adminId, jobId, queueName }, "Job replayed by admin");
  }
};
