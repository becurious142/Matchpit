import { env } from "../config/env";
import crypto from "crypto";

const alertCache = new Map<string, number>();
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

export async function sendSlackAlert(
  title: string,
  message: string,
  severity: "info" | "warning" | "error" | "critical" = "error",
  metadata?: Record<string, any>
): Promise<void> {
  const SLACK_WEBHOOK_URL = env.SLACK_WEBHOOK_URL;
  if (!SLACK_WEBHOOK_URL) {
    console.warn("[Slack] Webhook URL not configured. Skipping alert:", title);
    return;
  }

  // Create signature for deduplication
  const signatureString = `${severity}:${title}:${message}`;
  const signature = crypto.createHash("sha256").update(signatureString).digest("hex");

  const now = Date.now();
  const lastSent = alertCache.get(signature);

  if (lastSent && now - lastSent < RATE_LIMIT_MS) {
    console.warn(`[Slack] Throttled duplicate alert: ${title}`);
    return;
  }

  alertCache.set(signature, now);

  const colors = {
    info: "#36a64f",
    warning: "#ffcc00",
    error: "#ff0000",
    critical: "#8b0000",
  };

  const payload = {
    text: `*${title}*`,
    attachments: [
      {
        color: colors[severity] || colors.info,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
          ...(metadata
            ? [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: "```\n" + JSON.stringify(metadata, null, 2) + "\n```",
                  },
                },
              ]
            : []),
        ],
      },
    ],
  };

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Slack] Failed to send alert. Status: ${response.status}`);
    }
  } catch (err: any) {
    // Catch-all to prevent cron crashes
    console.error(`[Slack] Network error while sending alert: ${err.message}`);
  }
}
