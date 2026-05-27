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

/** Hosts that require TLS — redis:// must be upgraded to rediss:// */
const TLS_REDIS_HOST =
  /\.redis\.io$|\.upstash\.io$|\.redislabs\.com$|\.redis\.cloud$/i;

/**
 * Redis Cloud / Upstash URLs are often copied as redis:// but require TLS.
 * ioredis only enables TLS automatically for rediss:// URLs.
 */
export function resolveRedisUrl(url: string): string {
  if (url.startsWith("redis://") && TLS_REDIS_HOST.test(new URL(url).hostname)) {
    const upgraded = url.replace(/^redis:\/\//, "rediss://");
    logger.info(
      { host: new URL(url).hostname },
      "Upgrading Redis URL to rediss:// for TLS",
    );
    return upgraded;
  }
  return url;
}

function buildRedisOptions(url: string): RedisOptions {
  const opts: RedisOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
  };
  if (url.startsWith("rediss://")) {
    opts.tls = {};
  }
  return opts;
}

/** Create a dedicated ioredis connection (pub/sub needs its own). */
export function createRedisConnection(name: string): Redis {
  const url = resolveRedisUrl(REDIS_URL);
  const conn = new Redis(url, buildRedisOptions(url));


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
    _queueConnection = createRedisConnection("queue-producer");
  }
  return _queueConnection;
}

/**
 * Returns the shared Redis connection for BullMQ workers.
 * Should only be called from the worker process (src/worker.ts).
 */
export function getWorkerConnection(): Redis {
  if (!_workerConnection) {
    _workerConnection = createRedisConnection("queue-worker");
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
