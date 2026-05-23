import { env } from "../config/env";
/**
 * Phase 8 — Redis connection factory
 *
 * Provides separate ioredis connection instances for:
 *  - Queue producers (API layer enqueue calls)
 *  - Queue/Worker consumers (worker process)
 *
 * BullMQ requires separate connections per role per its documentation.
 * Each connection automatically reconnects on disconnect.
 */

import { Redis, type RedisOptions } from "ioredis";
import { logger } from "../lib/logger";

const REDIS_URL = env.REDIS_URL ?? "redis://localhost:6379";

/** Shared options applied to all ioredis connections */
const BASE_OPTS: RedisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,    // Avoid blocking on ready check
  lazyConnect: false,
};

function createConnection(name: string): Redis {
  const conn = new Redis(REDIS_URL, BASE_OPTS);


  conn.on("connect", () => {
    logger.info({ connection: name }, "Redis connected");
  });

  conn.on("error", (err) => {
    logger.error({ err, connection: name }, "Redis connection error");
  });

  conn.on("close", () => {
    logger.warn({ connection: name }, "Redis connection closed");
  });

  conn.on("reconnecting", (delay: number) => {
    logger.info({ connection: name, delay }, "Redis reconnecting");
  });

  return conn;
}

// Lazily created singletons — created on first use, not at module load
let _queueConnection: Redis | null = null;
let _workerConnection: Redis | null = null;

/**
 * Returns the shared Redis connection for queue producers (API layer).
 * Safe to call from API server process.
 */
export function getQueueConnection(): Redis {
  if (!_queueConnection) {
    _queueConnection = createConnection("queue-producer");
  }
  return _queueConnection;
}

/**
 * Returns the shared Redis connection for BullMQ workers.
 * Should only be called from the worker process (src/worker.ts).
 */
export function getWorkerConnection(): Redis {
  if (!_workerConnection) {
    _workerConnection = createConnection("queue-worker");
  }
  return _workerConnection;
}

/**
 * Check if Redis is reachable. Returns true if ping succeeds.
 * Used by health endpoint and degraded-mode detection.
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const conn = getQueueConnection();
    const result = await conn.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

/**
 * Close all open Redis connections gracefully.
 * Called on worker process SIGTERM.
 */
export async function closeConnections(): Promise<void> {
  const toClose: Promise<string>[] = [];
  if (_queueConnection) toClose.push(_queueConnection.quit());
  if (_workerConnection) toClose.push(_workerConnection.quit());
  await Promise.allSettled(toClose);
  _queueConnection = null;
  _workerConnection = null;
}
