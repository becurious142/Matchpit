import { env } from "../config/env";
import axios from "axios";
import { logger } from "./logger";

type AlertSeverity = "critical" | "warning";

interface AlertPayload {
  title: string;
  description: string;
  severity: AlertSeverity;
  context?: Record<string, any>;
}

/**
 * Dispatch an alert to Discord via incoming webhook.
 * ONLY for catastrophic events: financial drift, ledger imbalance, replay corruption, payout freezes.
 */
export async function sendCatastrophicAlert(payload: AlertPayload) {
  if (!env.DISCORD_WEBHOOK_URL) {
    logger.warn({ alert: payload.title }, "Discord webhook URL not configured, skipping alert.");
    return;
  }

  const color = payload.severity === "critical" ? 16711680 : 16753920; // Red : Orange
  
  try {
    await axios.post(env.DISCORD_WEBHOOK_URL, {
      embeds: [
        {
          title: `[${payload.severity.toUpperCase()}] ${payload.title}`,
          description: payload.description,
          color,
          fields: payload.context 
            ? Object.entries(payload.context).map(([k, v]) => ({
                name: k,
                value: typeof v === "object" ? JSON.stringify(v) : String(v),
                inline: true
              }))
            : [],
          timestamp: new Date().toISOString(),
        }
      ]
    });
    logger.info({ alert: payload.title }, "Discord alert dispatched.");
  } catch (err) {
    logger.error({ err, alert: payload.title }, "Failed to send Discord alert.");
  }
}
