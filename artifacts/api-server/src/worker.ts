/**
 * Phase 8 — Worker entry point
 *
 * Run as a SEPARATE process from the API server:
 *   node dist/worker.mjs
 *
 * This process only runs BullMQ workers — it does not serve HTTP traffic.
 * Keeping workers separate prevents worker crashes from affecting API availability.
 *
 * Graceful shutdown:
 *   - On SIGTERM/SIGINT: stop accepting new jobs
 *   - Wait up to 30s for in-flight jobs to complete
 *   - Force-exit after 30s
 */

import { config } from "dotenv";
config();

import { workerLogger as logger } from "./lib/logger";
import { startWorkers, stopWorkers } from "./queues/registry";
import { closeConnections } from "./queues/redis";
import { closeQueues } from "./queues/queues";

import http from "http";

const SHUTDOWN_TIMEOUT_MS = 30_000;
const WORKER_PORT = process.env.WORKER_PORT || 8081;

// Simple healthcheck server for Docker / Kubernetes probes
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health/live" || req.url === "/health/ready") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", type: "worker" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

async function main() {
  logger.info({ pid: process.pid }, "Worker process starting");

  // Validate required env vars
  const required = ["DATABASE_URL", "REDIS_URL"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error({ missing }, "Worker: missing required environment variables");
    process.exit(1);
  }

  try {
    await startWorkers();
    
    healthServer.listen(WORKER_PORT, () => {
      logger.info({ port: WORKER_PORT }, "Worker healthcheck server listening");
    });
    
    logger.info({ pid: process.pid }, "Worker process ready — consuming jobs");
  } catch (err) {
    logger.error({ err }, "Worker: failed to start workers");
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Worker: graceful shutdown initiated");

  const forceExit = setTimeout(() => {
    logger.warn("Worker: shutdown timeout reached — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    healthServer.close();
    await stopWorkers();
    await closeQueues();
    await closeConnections();
    
    const { closePool } = await import("@workspace/db");
    await closePool();

    clearTimeout(forceExit);
    logger.info("Worker: shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Worker: error during shutdown");
    clearTimeout(forceExit);
    process.exit(1);
  }
}

async function pauseWorkers() {
  logger.info("Worker: pausing all queues (SIGUSR1)");
  // In BullMQ, pausing queues requires pausing the actual queues or workers.
  // We'll pause the queue instances to stop accepting jobs.
  const { allQueues } = await import("./queues/queues");
  await Promise.all(Object.values(allQueues).map(q => q.pause()));
  logger.info("Worker: queues paused");
}

async function resumeWorkers() {
  logger.info("Worker: resuming all queues (SIGUSR2)");
  const { allQueues } = await import("./queues/queues");
  await Promise.all(Object.values(allQueues).map(q => q.resume()));
  logger.info("Worker: queues resumed");
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGUSR1", () => pauseWorkers().catch(err => logger.error(err)));
process.on("SIGUSR2", () => resumeWorkers().catch(err => logger.error(err)));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Worker: uncaught exception");
  shutdown("uncaughtException").catch(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Worker: unhandled rejection");
});

main().catch((err) => {
  logger.error({ err }, "Worker: startup failed");
  process.exit(1);
});
