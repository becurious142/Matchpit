import { Router } from "express";
import { z } from "zod";
import { requireAuth, getProfileByClerkId } from "../../lib/auth";
import { getAuth } from "@clerk/express";
import { geoRepository } from "../geo/geo.repository";

const router = Router();

const searchLocationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

router.post("/search-location", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { lat, lng } = searchLocationSchema.parse(req.body);
    
    // geoRepository internally truncates to 4 decimal places for privacy
    await geoRepository.upsertUserLocation(profile.id, lat, lng);

    res.json({ success: true });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "validation_error", details: err.errors });
    } else {
      req.log.error({ err }, "Error updating search location");
      res.status(500).json({ error: "internal_error" });
    }
  }
});

export const profileRoutes = router;
