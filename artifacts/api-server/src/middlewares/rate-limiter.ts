import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { getQueueConnection } from "../queues/redis";
import { logger } from "../lib/logger";
import { env } from "../config/env";

const redisClient = getQueueConnection();
const envPrefix = env.NODE_ENV || "development";

export const globalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
    prefix: `matchpit:${envPrefix}:ratelimit:global:`,
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per `window` (here, per 15 minutes)
  standardHeaders: true, 
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, "Global rate limit exceeded");
    res.status(options.statusCode).send(options.message);
  },
});

export const strictLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
    prefix: `matchpit:${envPrefix}:ratelimit:strict:`,
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, "Strict rate limit exceeded");
    res.status(options.statusCode).send(options.message);
  },
});

export const discoveryLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
    prefix: `matchpit:${envPrefix}:ratelimit:discovery:`,
  }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per 5 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, "Discovery rate limit exceeded");
    res.status(options.statusCode).send(options.message);
  },
});
