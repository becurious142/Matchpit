import { config } from "dotenv";
import app from "./app";
import { logger } from "./lib/logger";

// Load environment variables explicitly
config();

// ─── Required environment variable validation ─────────────────────────────────
const REQUIRED_ENV: string[] = ["PORT", "DATABASE_URL", "CLERK_SECRET_KEY"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[MATCHPIT] Missing required environment variables: ${missing.join(", ")}`);
  console.error("Set these in your .env file or deployment environment.");
  process.exit(1);
}

// ─── Optional env warnings ────────────────────────────────────────────────────
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  logger.warn("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — running in payment mock mode");
}
if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
  logger.warn("RAZORPAY_WEBHOOK_SECRET not set — webhook signature verification disabled");
}
if (!process.env.CORS_ORIGINS && !process.env.FRONTEND_URL && process.env.NODE_ENV === "production") {
  logger.warn("CORS_ORIGINS not set in production — all origins will be allowed");
}

const rawPort = process.env["PORT"]!;
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, env: process.env.NODE_ENV }, "Server listening");

  // Auto-seed referral config defaults if table is empty
  try {
    const { seedDefaultReferralConfig } = await import("./lib/wallet");
    await seedDefaultReferralConfig();
    logger.info("Referral config defaults ensured");
  } catch (seedErr) {
    logger.warn({ err: seedErr }, "Failed to auto-seed referral config — non-fatal");
  }
});
