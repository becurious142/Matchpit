import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("8080"),
  WORKER_PORT: z.string().default("8081"),
  DATABASE_URL: z.string().url("Must be a valid Postgres URL"),
  
  CLERK_SECRET_KEY: z.string().min(1, "Clerk secret key is required"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "Clerk publishable key is required"),
  
  REDIS_URL: z.string().url("Must be a valid Redis URL").optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  
  OTP_LESS_CLIENT_ID: z.string().optional(),
  OTP_LESS_CLIENT_SECRET: z.string().optional(),
  
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional(),
});

function parseSecrets() {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const error of result.error.issues) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }

  const env = result.data;

  // Task 3: Razorpay Production Enforcement
  if (env.NODE_ENV === "production") {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
      console.error("❌ RAZORPAY keys are MANDATORY in production mode.");
      process.exit(1);
    }
  }

  return env;
}

export const runtimeEnv = parseSecrets();

export const config = {
  env: runtimeEnv.NODE_ENV,
  port: parseInt(runtimeEnv.PORT, 10),
  workerPort: parseInt(runtimeEnv.WORKER_PORT, 10),
  
  db: {
    url: runtimeEnv.DATABASE_URL,
  },
  
  redis: {
    url: runtimeEnv.REDIS_URL,
    host: runtimeEnv.REDIS_HOST,
    port: runtimeEnv.REDIS_PORT ? parseInt(runtimeEnv.REDIS_PORT, 10) : 6379,
    password: runtimeEnv.REDIS_PASSWORD,
  },
  
  auth: {
    clerkSecretKey: runtimeEnv.CLERK_SECRET_KEY,
    clerkPublishableKey: runtimeEnv.CLERK_PUBLISHABLE_KEY,
    otpLessClientId: runtimeEnv.OTP_LESS_CLIENT_ID,
    otpLessClientSecret: runtimeEnv.OTP_LESS_CLIENT_SECRET,
  },
  
  payments: {
    razorpayKeyId: runtimeEnv.RAZORPAY_KEY_ID,
    razorpayKeySecret: runtimeEnv.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: runtimeEnv.RAZORPAY_WEBHOOK_SECRET,
    isMockMode: runtimeEnv.NODE_ENV !== "production" && (!runtimeEnv.RAZORPAY_KEY_ID || !runtimeEnv.RAZORPAY_KEY_SECRET),
  },
  
  cors: {
    frontendUrl: runtimeEnv.FRONTEND_URL,
    origins: runtimeEnv.CORS_ORIGINS ? runtimeEnv.CORS_ORIGINS.split(",") : [runtimeEnv.FRONTEND_URL],
  },
  
  sse: {
    heartbeatIntervalMs: 15_000,
    connectionTimeoutMs: 60_000,
    maxConnectionsPerUser: 3,
    maxConnectionsPerIp: 10,
  }
};
