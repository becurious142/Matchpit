import { Router } from "express";
import { requireAdmin } from "../lib/auth";
import { riskService } from "../domains/risk/risk.service";

const router = Router();

router.use(requireAdmin);

// Get all open fraud flags
router.get("/flags", async (req, res) => {
  try {
    const flags = await riskService.getOpenFraudFlags();
    res.json({ flags });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  }
});

// Resolve a fraud flag
router.post("/flags/:flagId/resolve", async (req, res) => {
  const { flagId } = req.params;
  const { resolution, action } = req.body;

  try {
    const adminId = (req as any).adminProfile.id;
    const flag = await riskService.resolveFraudFlag(flagId, resolution, action, adminId);

    if (!flag) {
      res.status(404).json({ error: "Flag not found" });
      return;
    }

    res.json({ success: true, flag });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: "Failed to resolve flag" });
  }
});

// Get risk events for an entity
router.get("/events", async (req, res) => {
  const { userId } = req.query;
  
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  try {
    const events = await riskService.getRiskEventsByUserId(userId);
    res.json({ events });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  }
});

export const adminRiskRouter = router;
