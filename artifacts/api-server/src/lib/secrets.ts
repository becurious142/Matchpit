/**
 * Centralized parsing and validation of environment secrets.
 * Ensures the app fails to start immediately if critical secrets are missing,
 * rather than failing at runtime.
 */
import { z } from "zod";

const secretsSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("8080"),
  DATABASE_URL: z.string().url("Must be a valid Postgres URL"),
  CLERK_SECRET_KEY: z.string().min(1, "Clerk secret key is required"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "Clerk publishable key is required"),
  REDIS_URL: z.string().url("Must be a valid Redis URL").optional(),
  REDIS_HOST: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  OTP_LESS_CLIENT_ID: z.string().optional(),
  OTP_LESS_CLIENT_SECRET: z.string().optional(),
});

export function parseSecrets() {
  const result = secretsSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const error of result.error.issues) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

// Exporting a singleton parsed object for use throughout the app
export const env = parseSecrets();
