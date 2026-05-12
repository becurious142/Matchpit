import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production, restrict to explicit allowed origins via CORS_ORIGINS env var.
// CORS_ORIGINS is a comma-separated list, e.g.:
//   CORS_ORIGINS=https://matchpit.in,https://www.matchpit.in,https://matchpit.vercel.app
// In development, allow all origins for convenience.
function buildCorsOrigin(): cors.CorsOptions["origin"] {
  const raw = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? "";
  if (!raw || process.env.NODE_ENV !== "production") {
    return true; // allow all in dev
  }
  const allowed = new Set(
    raw.split(",").map((o) => o.trim()).filter(Boolean)
  );
  return (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Razorpay webhooks)
    if (!origin) return callback(null, true);
    if (allowed.has(origin)) return callback(null, true);
    logger.warn({ origin }, "CORS blocked request from disallowed origin");
    callback(new Error(`CORS: origin ${origin} not allowed`));
  };
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: buildCorsOrigin() }));

// ─── RAW BODY for Razorpay webhook HMAC verification ─────────────────────────
// Must be registered BEFORE express.json() so the raw buffer is available
// on req.body for the /api/payments/webhook route.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug environment variables
console.log("Environment variables check:", {
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ? "✓ Present" : "✗ Missing",
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ? "✓ Present" : "✗ Missing", 
  CLERK_JWT_KEY: process.env.CLERK_JWT_KEY ? "✓ Present" : "✗ Missing",
});

app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    // Add JWT token support for Vercel serverless deployment
    jwtKey: process.env.CLERK_JWT_KEY,
  }),
);

app.use("/api", router);

export default app;
