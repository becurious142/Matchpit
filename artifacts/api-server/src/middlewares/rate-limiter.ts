import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type { Options } from "express-rate-limit";
import { getQueueConnection } from "../queues/redis";
import { logger } from "../lib/logger";
import { env } from "../config/env";

const envPrefix = env.NODE_ENV || "development";

/** Health/readiness paths must never depend on Redis for rate limiting. */
function isHealthPath(path: string): boolean {
  return (
    path === "/healthz" ||
    path === "/health" ||
    path.startsWith("/health/")
  );
}

function isLocalRedisUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/**
 * Use Redis-backed rate limiting only when a real Redis URL is configured.
 * Railway deploys without Redis otherwise default to redis://localhost:6379,
 * which breaks every request via RedisStore.
 */
function shouldUseRedisStore(): boolean {
  if (process.env.USE_MEMORY_RATE_LIMIT === "true") return false;
  if (isLocalRedisUrl(env.REDIS_URL) && env.NODE_ENV === "production") {
    logger.warn(
      { redisUrl: env.REDIS_URL },
      "REDIS_URL points to localhost in production — using in-memory rate limiter",
    );
    return false;
  }
  return true;
}

function buildLimiter(
  prefix: string,
  options: Pick<Options, "windowMs" | "max">,
): RateLimitRequestHandler {
  const base: Options = {
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    skip: (req) => isHealthPath(req.path),
    handler: (req, res, _next, limitOptions) => {
      logger.warn({ ip: req.ip, path: req.path }, `Rate limit exceeded (${prefix})`);
      res.status(limitOptions.statusCode).send(limitOptions.message);
    },
  };

  if (!shouldUseRedisStore()) {
    return rateLimit(base);
  }

  const redisClient = getQueueConnection();
  return rateLimit({
    ...base,
    store: new RedisStore({
      sendCommand: (...args: string[]) =>
        redisClient.call(args[0], ...args.slice(1)) as Promise<number>,
      prefix: `matchpit:${envPrefix}:ratelimit:${prefix}:`,
    }),
  });
}

export const globalLimiter = buildLimiter("global", {
  windowMs: 15 * 60 * 1000,
  max: 500,
});

export const strictLimiter = buildLimiter("strict", {
  windowMs: 60 * 1000,
  max: 30,
});

export const discoveryLimiter = buildLimiter("discovery", {
  windowMs: 5 * 60 * 1000,
  max: 100,
});
