import { env } from "./config/env";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
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
import crypto from "crypto";
import { securityHeaders, trustedProxyMiddleware, requireCsrfHeader, sessionIpDriftDetection } from "./middlewares/security";

const app: Express = express();

function buildCorsOrigin(): cors.CorsOptions["origin"] {
  const raw = env.CORS_ORIGINS ?? env.FRONTEND_URL ?? "";
  if (!raw || env.NODE_ENV !== "production") {
    return true;
  }
  const allowed = new Set(
    raw.split(",").map((o: string) => o.trim()).filter(Boolean)
  );
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowed.has(origin)) return callback(null, true);
    logger.warn({ origin }, "CORS blocked request from disallowed origin");
    callback(new Error(`CORS: origin ${origin} not allowed`));
  };
}

app.use(
  pinoHttp({
    logger,
    genReqId: function (req, res) {
      const existingId = req.id ?? req.headers["x-request-id"];
      if (existingId) return existingId;
      const id = crypto.randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
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
  })
);

app.set("trust proxy", 1); // Trust proxy (Cloudflare/Vercel)
app.use(trustedProxyMiddleware);
app.use(securityHeaders);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: buildCorsOrigin() }));

app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
    jwtKey: env.CLERK_JWT_KEY,
  })
);

app.use(sessionIpDriftDetection);

// Apply CSRF to non-GET/OPTIONS mutations, excluding webhooks
app.use((req, res, next) => {
  if (req.path.startsWith("/api/payments/webhook") || req.method === "GET" || req.method === "OPTIONS") {
    return next();
  }
  requireCsrfHeader(req, res, next);
});

app.use("/api", router);

// Return JSON for unhandled errors (avoids opaque HTML 500 pages on Railway/Vercel)
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const log = (req as Request & { log?: { error: (o: object, msg: string) => void } }).log;
  log?.error({ err }, "Unhandled request error");
  if (!res.headersSent) {
    res.status(500).json({
      error: "internal_error",
      message: err instanceof Error ? err.message : "Unexpected server error",
    });
  }
});

export default app;
