/**
 * Temporary admin maintenance routes.
 *
 * GET /api/admin/regenerate-slots   – Cleans and rebuilds slot inventory
 * GET /api/admin/backfill-pricing   – Fills zero-value venue tier prices
 *
 * Both routes are protected by requireAdmin (isAdmin=true on profile).
 * Remove or gate behind DISABLE_MAINTENANCE_ROUTES=true once run in production.
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/auth";
import {
  regenerateVenueSlotsForNext14Days,
  backfillVenuePricingDefaults,
} from "../utils/regenerateVenueSlots";

const router: IRouter = Router();

// ─── GET /admin/regenerate-slots ─────────────────────────────────────────────

router.get("/admin/regenerate-slots", requireAdmin, async (req, res) => {
  try {
    const result = await regenerateVenueSlotsForNext14Days();
    res.json({
      ok: true,
      venuesProcessed: result.venuesProcessed,
      slotsDeleted: result.slotsDeleted,
      slotsCreated: result.slotsCreated,
      errors: result.errors,
    });
  } catch (err) {
    req.log.error({ err }, "Error during slot regeneration");
    res.status(500).json({
      error: "internal_error",
      message: "Slot regeneration failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── GET /admin/backfill-pricing ─────────────────────────────────────────────

router.get("/admin/backfill-pricing", requireAdmin, async (req, res) => {
  try {
    const result = await backfillVenuePricingDefaults();
    res.json({
      ok: true,
      venuesUpdated: result.venuesUpdated,
      errors: result.errors,
    });
  } catch (err) {
    req.log.error({ err }, "Error during pricing backfill");
    res.status(500).json({
      error: "internal_error",
      message: "Pricing backfill failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
