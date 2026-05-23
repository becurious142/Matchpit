import { env } from "../config/env";
import pino from "pino";

const isProduction = env.NODE_ENV === "production";

export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction ? {} : {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    }
  })
});

export const workerLogger = logger.child({ component: "worker" });
export const paymentLogger = logger.child({ component: "payment" });
export const securityLogger = logger.child({ component: "security" });
export const sseLogger = logger.child({ component: "sse" });
