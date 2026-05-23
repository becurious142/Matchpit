import { Worker, Queue } from "bullmq";
import { getWorkerConnection, getQueueConnection } from "../queues/redis";
import { logger } from "../lib/logger";

const queueName = "cache-refresh";


export const cacheRefreshWorker = new Worker(
  queueName,
  async (job) => {
    const { key, type, query } = job.data;
    logger.info({ jobId: job.id, key, type }, "Processing cache refresh");
    
    // In actual implementation, we will import discoveryService and fetch data
    // to populate the cache here to avoid circular dependencies in this file.
    if (type === "venues") {
      const { discoveryService } = await import("../domains/discovery/discovery.service");
      await discoveryService.refreshVenuesCache(query, key);
    } else if (type === "matches") {
      const { discoveryService } = await import("../domains/discovery/discovery.service");
      await discoveryService.refreshMatchesCache(query, key);
    }
  },
  {
    connection: getWorkerConnection(),
    concurrency: 5,
  }
);

cacheRefreshWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Cache refresh failed");
});
