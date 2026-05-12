import { Router, type IRouter } from "express";

const router: IRouter = Router();

function healthHandler(_req: any, res: any) {
  // Simple health check - no validation needed
  res.json({ status: "ok" });
}

// Primary health endpoint (used by Replit artifact health check)
router.get("/healthz", healthHandler);

// Standard alias used by Vercel, Railway, and most deployment platforms
router.get("/health", healthHandler);

export default router;
