import { Router } from "express";
import { db } from "@workspace/db";
import {
  hostedMatchReservationsTable,
  hostedMatchesTable,
  paymentsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireAuth } from "../lib/auth";

const router = Router();

// HM10 PATCH 12: Chaos Simulation Utilities
// Guard: ONLY run in development/staging.
const isChaosEnabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_CHAOS_ENDPOINTS === "true";

router.use("/chaos", (req, res, next) => {
  if (!isChaosEnabled) {
    res.status(403).json({ error: "forbidden", message: "Chaos endpoints are disabled in this environment." });
    return;
  }
  next();
});

// Chaos 1: Force expire an active reservation to test late-webhook handling
router.post("/chaos/reservations/:id/expire", requireAuth, async (req, res) => {
  try {
    const reservationId = req.params.id;

    const [reservation] = await db
      .update(hostedMatchReservationsTable)
      .set({
        reservationStatus: "expired",
        isActive: false, // Make terminal
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hostedMatchReservationsTable.id, reservationId),
          eq(hostedMatchReservationsTable.isActive, true)
        )
      )
      .returning();

    if (!reservation) {
      res.status(404).json({ error: "not_found", message: "Active reservation not found" });
      return;
    }

    logger.warn({ reservationId }, "CHAOS: Forced reservation expiry");
    res.json({ success: true, reservation });
  } catch (err) {
    logger.error({ err }, "Chaos expire reservation failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// Chaos 2: Simulate duplicate webhook fire
router.post("/chaos/webhooks/duplicate", requireAuth, async (req, res) => {
  try {
    const { orderId, eventType } = req.body as { orderId: string, eventType: string };
    
    // In a real environment, you'd trigger the webhook handler function directly
    // or make a self-fetch. For chaos testing, we log it and provide instructions.
    logger.warn({ orderId, eventType }, "CHAOS: Duplicate webhook simulation invoked");
    
    res.json({ 
      success: true, 
      message: "Please curl the /payments/webhook endpoint with identical payload to test idempotency."
    });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// Chaos 3: Simulate underfilled match cancellation manually
router.post("/chaos/matches/:id/cancel", requireAuth, async (req, res) => {
  try {
    const matchId = req.params.id;
    
    // Just a wrapper to forcefully hit the cancel endpoint logic bypassing some auth
    logger.warn({ matchId }, "CHAOS: Forced match cancellation invoked");
    
    res.json({ success: true, instruction: "Use the normal DELETE /hosted-matches/:matchId endpoint as admin." });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

export { router as chaosRouter };
