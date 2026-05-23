import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load from .env file if in development
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
}

// Convert "true"/"false" strings to boolean
const booleanString = z
  .enum(["true", "false"])
  .transform((val: string) => val === "true")
  .default("false");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3001"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  
  FRONTEND_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  
  DATABASE_URL: z.string().url("Must be a valid Postgres connection string"),
  REDIS_URL: z.string().url("Must be a valid Redis connection string").default("redis://localhost:6379"),
  ENABLE_BULL_BOARD: z.coerce.boolean().default(false),

  // Realtime & Cache Feature Flags
  ENABLE_REALTIME: z.coerce.boolean().default(true),
  ENABLE_SSE_DISCOVERY: z.coerce.boolean().default(true),
  ENABLE_SSE_MATCHES: z.coerce.boolean().default(true),
  ENABLE_EVENT_BUS: z.coerce.boolean().default(true),
  ENABLE_PRESENCE: z.coerce.boolean().default(true),
  ENABLE_CACHE_PREWARMING: z.coerce.boolean().default(true),
  ENABLE_GEO_ABUSE_PROTECTION: z.coerce.boolean().default(true),

  SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(15000),
  SSE_CONNECTION_TIMEOUT_MS: z.coerce.number().default(300000),
  MAX_SSE_CONNECTIONS_PER_USER: z.coerce.number().default(5),

  // Auth (Clerk)
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "Clerk Publishable Key is required"),
  CLERK_SECRET_KEY: z.string().min(1, "Clerk Secret Key is required"),
  CLERK_JWT_KEY: z.string().optional(),

  // Payments (Razorpay)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Notifications
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Matchpit <noreply@matchpit.in>"),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Feature Flags
  ENABLE_UPFRONT_MODEL: booleanString.default("true"),
  ENABLE_ATTENDANCE_VERIFICATION: booleanString.default("true"),
  ENABLE_REWARDS_ENGINE: booleanString.default("true"),
  ENABLE_NOTIFICATIONS: booleanString.default("true"),
  ENABLE_QUEUE_WORKERS: booleanString.default("true"),
  ASYNC_NOTIFICATIONS: booleanString.default("true"),
  ASYNC_SETTLEMENTS: booleanString.default("true"),
  ASYNC_CRON: booleanString.default("true"),

  WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
