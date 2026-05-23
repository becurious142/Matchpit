import { Router } from "express";
import { discoveryQuerySchema } from "./discovery.types";
import { discoveryService } from "./discovery.service";

const router = Router();

router.get("/venues/nearby", async (req, res) => {
  try {
    const query = discoveryQuerySchema.parse(req.query);
    const result = await discoveryService.getNearbyVenues(query);
    res.json(result);
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "validation_error", details: err.errors });
    } else {
      req.log.error({ err }, "Error in venues discovery");
      res.status(500).json({ error: "internal_error" });
    }
  }
});

router.get("/matches/nearby", async (req, res) => {
  try {
    const query = discoveryQuerySchema.parse(req.query);
    const result = await discoveryService.getNearbyMatches(query);
    res.json(result);
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "validation_error", details: err.errors });
    } else {
      req.log.error({ err }, "Error in matches discovery");
      res.status(500).json({ error: "internal_error" });
    }
  }
});

export const discoveryRoutes = router;
