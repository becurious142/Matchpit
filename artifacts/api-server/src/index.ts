import { config } from "dotenv";
config();

import app from "./app";
import { logger } from "./lib/logger";
import { config as runtimeConfig } from "./config/runtime";

if (runtimeConfig.payments.isMockMode) {
  logger.warn("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — running in payment mock mode");
}
if (!runtimeConfig.payments.razorpayWebhookSecret) {
  logger.warn("RAZORPAY_WEBHOOK_SECRET not set — webhook signature verification disabled");
}

const port = runtimeConfig.port;

const server = app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, env: runtimeConfig.env }, "Server listening");

  // Auto-seed referral config defaults if table is empty
  try {
    const { seedDefaultReferralConfig } = await import("./lib/wallet");
    await seedDefaultReferralConfig();
    logger.info("Referral config defaults ensured");
  } catch (seedErr) {
    logger.warn({ err: seedErr }, "Failed to auto-seed referral config — non-fatal");
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, "API: graceful shutdown initiated");
  
  const forceExit = setTimeout(() => {
    logger.warn("API: shutdown timeout reached — forcing exit");
    process.exit(1);
  }, 30_000);

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "API: error during server close");
    }
    try {
      const { sseManager } = await import("./lib/sse-manager");
      sseManager.closeAll();
      
      const { closeConnections } = await import("./queues/redis");
      await closeConnections();

      const { closePool } = await import("@workspace/db");
      await closePool();

      clearTimeout(forceExit);
      logger.info("API: shutdown complete");
      process.exit(0);
    } catch (e) {
      logger.error({ err: e }, "API: error during cleanup");
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
