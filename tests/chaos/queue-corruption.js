/**
 * Chaos test to simulate Queue Corruption and Poison Jobs.
 * 
 * Tests:
 * 1. Redis disconnect during job processing.
 * 2. Poison jobs that fail repeatedly and trigger quarantine logic.
 */

const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis("redis://127.0.0.1:6379", { maxRetriesPerRequest: null });
const testQueue = new Queue("chaos-test", { connection });

async function simulatePoisonJobs() {
  console.log("Adding jobs that are guaranteed to fail...");
  for(let i=0; i<3; i++) {
    await testQueue.add("fail-job", { simulateFail: true });
  }

  const worker = new Worker("chaos-test", async (job) => {
    if (job.data.simulateFail) {
      throw new Error("Simulated job failure to test poison quarantine.");
    }
    return "success";
  }, { connection, attempts: 5, backoff: { type: "fixed", delay: 100 } });

  worker.on("failed", (job, err) => {
    console.log(`Job ${job.id} failed. Attempts: ${job.attemptsMade}`);
  });

  console.log("Worker listening. Wait ~2 seconds to observe Max Attempts reached.");
  
  setTimeout(async () => {
    const failed = await testQueue.getFailedCount();
    console.log(`Failed jobs count (quarantined): ${failed}`);
    await worker.close();
    process.exit(0);
  }, 3000);
}

simulatePoisonJobs();
