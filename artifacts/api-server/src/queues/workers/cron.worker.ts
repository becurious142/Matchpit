import { Worker, Job } from "bullmq";
import { getWorkerConnection } from "../redis";
import { writeJobComplete, writeJobFailed, writeJobExhausted } from "../job-executions";
import { sendSlackAlert } from "../../lib/slack";
import { logger } from "../../lib/logger";

// Import all cron handlers
import {
  processUnderfillCancellations,
  dropUnpaidParticipants,
  releaseExpiredReservations,
  reconcileHostedMatchPayments,
} from "../../lib/match-cron";

let workerInstance: Worker | null = null;

export async function createCronWorker() {
  const connection = getWorkerConnection();
  
  workerInstance = new Worker("cron-jobs", async (job: Job) => {
    logger.info(`Running cron job: ${job.name} (Job ID: ${job.id})`);
    
    switch (job.name) {
      case "processUnderfillCancellations":
        return processUnderfillCancellations();
        
      case "dropUnpaidParticipants":
        return dropUnpaidParticipants();
        
      case "releaseExpiredReservations":
        return releaseExpiredReservations();
        
      case "reconcileHostedMatchPayments":
        return reconcileHostedMatchPayments();
        
      default:
        throw new Error(`Unknown cron job name: ${job.name}`);
    }
  }, {
    connection,
    concurrency: 1, // Crucial: avoid parallel executions of the same cron
    stalledInterval: 30_000,
  });

  workerInstance.on("completed", async (job) => {
    const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    await writeJobComplete(job.id!, duration);
  });

  workerInstance.on("failed", async (job, err) => {
    if (!job) return;
    
    if (job.attemptsMade >= (job.opts.attempts || 1)) {
      await writeJobExhausted(job.id!, err, job.attemptsMade);
      await sendSlackAlert("Cron Job Exhausted", `Job ${job.name} failed after ${job.attemptsMade} attempts.\n${err.message}`);
    } else {
      await writeJobFailed(job.id!, err, job.attemptsMade);
    }
  });

  return workerInstance;
}

export async function closeCronWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}
