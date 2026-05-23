import { test, expect } from "vitest";
import { Queue, Worker } from "bullmq";
import { getQueueConnection } from "../../artifacts/api-server/src/queues/redis";

test("Chaos: Poison jobs and worker stalls", async () => {
  const connection = getQueueConnection();
  const queueName = "chaos-queue";
  
  const queue = new Queue(queueName, { connection });
  
  // Create a worker that always fails for poison jobs
  let failCount = 0;
  const worker = new Worker(queueName, async (job) => {
    if (job.data.type === "poison") {
      failCount++;
      throw new Error("Poison job");
    }
    return "success";
  }, { connection });

  // Add a poison job
  const job = await queue.add("test-job", { type: "poison" }, {
    attempts: 3,
    backoff: { type: "fixed", delay: 100 }
  });

  // Wait for attempts to exhaust (3 attempts * 100ms)
  await new Promise(r => setTimeout(r, 1000));
  
  const finalJob = await queue.getJob(job.id!);
  
  // Should be marked failed and exhausted
  expect(await finalJob?.isFailed()).toBe(true);
  expect(failCount).toBeGreaterThanOrEqual(3);

  await worker.close();
  await queue.close();
});
