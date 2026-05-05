import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function healthHandler(_req: any, res: any) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

// Primary health endpoint (used by Replit artifact health check)
router.get("/healthz", healthHandler);

// Standard alias used by Vercel, Railway, and most deployment platforms
router.get("/health", healthHandler);

export default router;
