import { env } from "../config/env";
import pino from "pino";
import path from "path";
import fs from "fs";

const isProduction = env.NODE_ENV === "production";
const logsDir = path.join(process.cwd(), "logs");

if (isProduction && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  transport: isProduction
    ? {
        targets: [
          { target: "pino/file", options: { destination: path.join(logsDir, "api.log") }, level: "info" },
          // A real production setup would route based on component/tags using a custom transport or pino-pretty,
          // but for now we write everything to api.log, and workers can write to worker.log.
        ],
      }
    : {
        target: "pino-pretty",
        options: { colorize: true },
      },
});

export const workerLogger = isProduction 
  ? pino({ transport: { target: "pino/file", options: { destination: path.join(logsDir, "workers.log") } } })
  : logger.child({ component: "worker" });

export const paymentLogger = isProduction 
  ? pino({ transport: { target: "pino/file", options: { destination: path.join(logsDir, "payments.log") } } })
  : logger.child({ component: "payment" });

export const securityLogger = isProduction 
  ? pino({ transport: { target: "pino/file", options: { destination: path.join(logsDir, "security.log") } } })
  : logger.child({ component: "security" });

export const sseLogger = isProduction 
  ? pino({ transport: { target: "pino/file", options: { destination: path.join(logsDir, "sse.log") } } })
  : logger.child({ component: "sse" });
