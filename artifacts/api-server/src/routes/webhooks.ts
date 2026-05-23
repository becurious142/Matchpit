import { env } from "../config/env";
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { notificationDispatchLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { markDelivered, markFailed, processFailedNotifications } from "../lib/notifications";

const router: IRouter = Router();

function verifyWebhookSignature(req: any, res: any, next: any) {
  const secret = env.WEBHOOK_SECRET;
  if (!secret) {
    if (env.NODE_ENV === "production") {
      res.status(401).json({ error: "webhook_secret_not_configured" });
      return;
    }
    return next();
  }
  const signature = req.headers["x-matchpit-signature"] as string | undefined;
  if (!signature) { res.status(401).json({ error: "missing_signature" }); return; }
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex")}`;
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }
  next();
}

// GET /webhooks/notifications/health
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    feature: env.ENABLE_NOTIFICATIONS ? "enabled" : "disabled",
  });
});

// GET /webhooks/notifications/delivered — Meta Cloud API challenge verification
router.get("/delivered", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: "verification_failed" });
  }
});

// POST /webhooks/notifications/delivered
router.post("/delivered", verifyWebhookSignature, async (req, res) => {
  const body = req.body as any;
  try {
    if (body?.logId) {
      const updated = await markDelivered(body.logId);
      res.json({ acknowledged: true, updated });
      return;
    }
    // Meta Cloud API format
    let updatedCount = 0;
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const status of change?.value?.statuses ?? []) {
          if (status?.status === "delivered" || status?.status === "read") {
            const r = await db.update(notificationDispatchLogsTable)
              .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
              .where(eq(notificationDispatchLogsTable.destination, status?.recipient_id));
            updatedCount += r.rowCount ?? 0;
          }
        }
      }
    }
    res.json({ acknowledged: true, updated: updatedCount });
  } catch (err: any) {
    logger.error({ err }, "Webhook /delivered error");
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /webhooks/notifications/failed
router.post("/failed", verifyWebhookSignature, async (req, res) => {
  const body = req.body as any;
  try {
    if (body?.logId) {
      const updated = await markFailed(body.logId, body?.reason ?? "provider_failure");
      res.json({ acknowledged: true, updated });
      return;
    }
    let updatedCount = 0;
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const status of change?.value?.statuses ?? []) {
          if (status?.status === "failed") {
            const errMsg = status?.errors?.[0]?.message ?? "provider_failure";
            const r = await db.update(notificationDispatchLogsTable)
              .set({ status: "failed", lastError: errMsg, updatedAt: new Date() })
              .where(eq(notificationDispatchLogsTable.destination, status?.recipient_id));
            updatedCount += r.rowCount ?? 0;
          }
        }
      }
    }
    res.json({ acknowledged: true, updated: updatedCount });
  } catch (err: any) {
    logger.error({ err }, "Webhook /failed error");
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /webhooks/notifications/retry  — manual retry trigger
router.post("/retry", verifyWebhookSignature, async (_req, res) => {
  try {
    const result = await processFailedNotifications();
    res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (err: any) {
    logger.error({ err }, "Webhook /retry error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
