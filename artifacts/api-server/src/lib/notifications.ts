import { env } from "../config/env";
/**
 * Phase 4 + Phase 8: Notification Engine
 *
 * Features:
 *  - Multi-channel dispatch: in_app, whatsapp, email
 *  - Template-based messages with variable interpolation
 *  - Idempotent sending (dedup via SHA-256 key)
 *  - Phase 8: async BullMQ dispatch for whatsapp/email (rate-limited, retryable)
 *  - Retry queue with exponential back-off (max 3 retries)
 *  - Full audit trail in notification_dispatch_logs
 *  - Feature flags: ENABLE_NOTIFICATIONS, ASYNC_NOTIFICATIONS
 *
 * Provider credentials (env):
 *  - WHATSAPP_API_KEY            — Meta Cloud API Bearer token
 *  - WHATSAPP_PHONE_NUMBER_ID    — Meta phone number ID
 *  - RESEND_API_KEY              — Resend email provider key
 *  - EMAIL_FROM                  — Sender address  e.g. "Matchpit <noreply@matchpit.in>"
 */

import crypto from "crypto";
import { db } from "@workspace/db";
import {
  notificationsTable,
  notificationDispatchLogsTable,
  profilesTable,
  type InsertNotification,
} from "@workspace/db";
import { eq, and, lt, lte } from "drizzle-orm";
import { logger } from "./logger";

// ─── Feature flags ─────────────────────────────────────────────────────────────
export const ENABLE_NOTIFICATIONS: boolean =
  env.ENABLE_NOTIFICATIONS;

/**
 * Phase 8: when true, whatsapp/email channels are enqueued to BullMQ instead
 * of being dispatched inline. Falls back to inline if Redis is unavailable.
 */
const ASYNC_NOTIFICATIONS: boolean =
  env.ENABLE_QUEUE_WORKERS &&
  env.ASYNC_NOTIFICATIONS;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type NotificationChannel = "in_app" | "whatsapp" | "email";

export interface NotificationVars {
  [key: string]: string | number;
}

export interface NotificationOptions {
  userId: string;
  templateKey: NotificationTemplateKey;
  vars?: NotificationVars;
  /** Stable reference used for idempotency (e.g. matchId, paymentId) */
  referenceId?: string;
  channels?: NotificationChannel[];
}

export interface SendResult {
  channel: NotificationChannel;
  outcome: "sent" | "queued" | "skipped_duplicate" | "failed" | "feature_disabled";
  logId?: string;
}

// ─── Template Registry ─────────────────────────────────────────────────────────

export const NOTIFICATION_TEMPLATES = {
  // Payment events
  payment_success: {
    inApp: {
      title: "Payment Successful ✅",
      body: "Your payment of ₹{{amount}} for {{matchTitle}} was received.",
    },
    whatsapp: "Hi {{name}} 👋 Your payment of ₹{{amount}} for *{{matchTitle}}* was successful. See you on the field! 🏟️",
    email: {
      subject: "Payment Confirmed — {{matchTitle}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>Your payment of <b>₹{{amount}}</b> for <b>{{matchTitle}}</b> has been confirmed.</p><p>See you on the field! 🏟️</p>",
    },
  },

  // Match events
  match_joined: {
    inApp: {
      title: "You joined {{matchTitle}} 🎉",
      body: "You've successfully joined the match on {{matchDate}} at {{venue}}.",
    },
    whatsapp: "You're in! 🎉 You've joined *{{matchTitle}}* on {{matchDate}} at {{venue}}. Get ready to play! ⚽",
    email: {
      subject: "You've Joined — {{matchTitle}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>You're confirmed for <b>{{matchTitle}}</b> on <b>{{matchDate}}</b> at <b>{{venue}}</b>.</p>",
    },
  },

  match_confirmed: {
    inApp: {
      title: "Match Confirmed ✅ — {{matchTitle}}",
      body: "Your match on {{matchDate}} at {{venue}} is confirmed. {{currentPlayers}}/{{totalPlayers}} players ready.",
    },
    whatsapp: "🏆 Match Confirmed! *{{matchTitle}}* on {{matchDate}} at {{venue}} is go! {{currentPlayers}}/{{totalPlayers}} players locked in.",
    email: {
      subject: "Match Confirmed — {{matchTitle}}",
      html: "<p>Great news! <b>{{matchTitle}}</b> on <b>{{matchDate}}</b> at <b>{{venue}}</b> is confirmed with {{currentPlayers}} players.</p>",
    },
  },

  match_cancelled: {
    inApp: {
      title: "Match Cancelled — {{matchTitle}}",
      body: "{{matchTitle}} on {{matchDate}} has been cancelled. Refund: ₹{{refundAmount}}.",
    },
    whatsapp: "⚠️ *{{matchTitle}}* on {{matchDate}} has been cancelled. Your refund of ₹{{refundAmount}} will be processed shortly.",
    email: {
      subject: "Match Cancelled — {{matchTitle}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>We're sorry — <b>{{matchTitle}}</b> on <b>{{matchDate}}</b> has been cancelled.</p><p>Your refund of <b>₹{{refundAmount}}</b> will be processed within 5–7 business days.</p>",
    },
  },

  // Attendance / Phase 3 events
  attendance_reminder: {
    inApp: {
      title: "Confirm Your Attendance — {{matchTitle}}",
      body: "Please confirm you attended {{matchTitle}} on {{matchDate}}. Deadline: {{deadline}}.",
    },
    whatsapp: "📋 Did you play? Confirm your attendance for *{{matchTitle}}* ({{matchDate}}) before {{deadline}}. Open the app to confirm.",
    email: {
      subject: "Confirm Attendance — {{matchTitle}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>Please confirm your attendance for <b>{{matchTitle}}</b> ({{matchDate}}) before <b>{{deadline}}</b>.</p>",
    },
  },

  match_disputed: {
    inApp: {
      title: "Match Disputed — {{matchTitle}}",
      body: "{{matchTitle}} has been flagged for review. Our team will resolve it within 48 hours.",
    },
    whatsapp: "⚠️ *{{matchTitle}}* has been flagged for admin review. We'll resolve this within 48 hours and update you.",
    email: {
      subject: "Match Under Review — {{matchTitle}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p><b>{{matchTitle}}</b> has been flagged for review. Our team will investigate and contact you within 48 hours.</p>",
    },
  },

  // Payment reminders
  final_payment_due: {
    inApp: {
      title: "Final Payment Due — {{matchTitle}}",
      body: "Pay ₹{{amount}} by {{deadline}} to secure your spot in {{matchTitle}}.",
    },
    whatsapp: "⏰ Final payment of ₹{{amount}} for *{{matchTitle}}* is due by {{deadline}}. Pay now to keep your spot!",
    email: {
      subject: "Final Payment Due — {{matchTitle}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>Your final payment of <b>₹{{amount}}</b> for <b>{{matchTitle}}</b> is due by <b>{{deadline}}</b>.</p>",
    },
  },

  // Wallet events
  wallet_refund_credited: {
    inApp: {
      title: "Wallet Refund ₹{{amount}} Credited",
      body: "₹{{amount}} has been added to your Matchpit wallet. Reason: {{reason}}.",
    },
    whatsapp: "💰 ₹{{amount}} has been credited to your Matchpit wallet. Reason: {{reason}}. Use it for your next match!",
    email: {
      subject: "Wallet Refund Credited — ₹{{amount}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p><b>₹{{amount}}</b> has been added to your Matchpit wallet.</p><p>Reason: {{reason}}.</p>",
    },
  },

  wallet_fallback_refund: {
    inApp: {
      title: "Refund Credited to Wallet",
      body: "We were unable to refund ₹{{amount}} to your original payment method. The amount has been credited to your Matchpit wallet instead.",
    },
    whatsapp: "💰 We were unable to refund ₹{{amount}} to your original payment method. We've safely credited this amount to your Matchpit wallet instead.",
    email: {
      subject: "Refund Credited to Wallet — ₹{{amount}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>We were unable to process a refund of <b>₹{{amount}}</b> to your original payment method.</p><p>We've safely credited this amount to your Matchpit wallet instead. You can use this balance for future matches.</p>",
    },
  },

  // Host events
  host_match_full: {
    inApp: {
      title: "Your Match is Full! 🎉",
      body: "{{matchTitle}} on {{matchDate}} is now full ({{totalPlayers}} players).",
    },
    whatsapp: "🎉 Your match *{{matchTitle}}* on {{matchDate}} is FULL! All {{totalPlayers}} spots taken.",
    email: {
      subject: "Match Full — {{matchTitle}}",
      html: "<p>Congratulations! <b>{{matchTitle}}</b> on <b>{{matchDate}}</b> is full with <b>{{totalPlayers}}</b> players.</p>",
    },
  },

  // Badge
  badge_earned: {
    inApp: {
      title: "New Badge: {{badgeName}} 🏅",
      body: "You earned the {{badgeName}} badge! {{badgeDescription}}",
    },
    whatsapp: "🏅 You earned a new badge: *{{badgeName}}*! {{badgeDescription}} Keep it up!",
    email: {
      subject: "New Badge Earned — {{badgeName}}",
      html: "<p>Congratulations! You earned the <b>{{badgeName}}</b> badge! {{badgeDescription}}</p>",
    },
  },

  // Generic / fallback
  generic: {
    inApp: {
      title: "{{title}}",
      body: "{{body}}",
    },
    whatsapp: "{{body}}",
    email: {
      subject: "{{title}}",
      html: "<p>{{body}}</p>",
    },
  },

  // ── Phase 5: Reward events ──────────────────────────────────────────────────

  reward_credited: {
    inApp: {
      title: "₹{{amount}} Reward Credited 🎉",
      body: "{{description}} has been added to your Matchpit wallet.",
    },
    whatsapp:
      "🎉 ₹{{amount}} reward has been credited to your Matchpit wallet! {{description}}. Use it on your next match!",
    email: {
      subject: "Reward Credited — ₹{{amount}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p><b>₹{{amount}}</b> has been credited to your Matchpit wallet.</p><p>{{description}}</p>",
    },
  },

  reward_expired: {
    inApp: {
      title: "Reward Expired — ₹{{amount}}",
      body: "Your ₹{{amount}} reward ({{description}}) has expired. Earn new rewards by playing more matches!",
    },
    whatsapp:
      "⚠️ Your ₹{{amount}} Matchpit reward has expired. Keep playing to earn more rewards!",
    email: {
      subject: "Reward Expired — ₹{{amount}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>Your <b>₹{{amount}}</b> reward ({{description}}) has expired.</p><p>Play more matches to earn new rewards!</p>",
    },
  },

  referral_bonus: {
    inApp: {
      title: "Referral Bonus ₹{{amount}} Credited 🤝",
      body: "Your friend {{friendName}} completed their first match. ₹{{amount}} added to your wallet!",
    },
    whatsapp:
      "🤝 Your friend *{{friendName}}* just played their first match on Matchpit! ₹{{amount}} referral bonus has been added to your wallet!",
    email: {
      subject: "Referral Bonus Credited — ₹{{amount}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>Your friend <b>{{friendName}}</b> just completed their first match on Matchpit!</p><p><b>₹{{amount}}</b> has been added to your wallet as a referral bonus. 🎉</p>",
    },
  },

  cashback_earned: {
    inApp: {
      title: "Cashback ₹{{amount}} Earned 💰",
      body: "Congrats on your {{milestone}}! ₹{{amount}} cashback added to your wallet.",
    },
    whatsapp:
      "💰 You earned ₹{{amount}} cashback for your {{milestone}} on Matchpit! Your wallet has been credited.",
    email: {
      subject: "Cashback Earned — ₹{{amount}}",
      html: "<p>Hi <b>{{name}}</b>,</p><p>Congratulations on your <b>{{milestone}}</b>!</p><p><b>₹{{amount}}</b> cashback has been added to your Matchpit wallet.</p>",
    },
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

// ─── Idempotency ───────────────────────────────────────────────────────────────

export function buildIdempotencyKey(
  userId: string,
  templateKey: string,
  channel: string,
  referenceId?: string
): string {
  const raw = `${userId}:${templateKey}:${channel}:${referenceId ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ─── Template rendering ────────────────────────────────────────────────────────

function interpolate(template: string, vars: NotificationVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`
  );
}

function renderTemplate(
  templateKey: NotificationTemplateKey,
  channel: NotificationChannel,
  vars: NotificationVars
): { title?: string; body: string; subject?: string; html?: string } {
  const tpl = NOTIFICATION_TEMPLATES[templateKey];
  if (channel === "in_app") {
    return {
      title: interpolate(tpl.inApp.title, vars),
      body: interpolate(tpl.inApp.body, vars),
    };
  }
  if (channel === "whatsapp") {
    return { body: interpolate(tpl.whatsapp, vars) };
  }
  if (channel === "email") {
    return {
      subject: interpolate(tpl.email.subject, vars),
      body: interpolate(tpl.email.subject, vars),
      html: interpolate(tpl.email.html, vars),
    };
  }
  return { body: "" };
}

// ─── WhatsApp Provider ─────────────────────────────────────────────────────────

interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsApp(
  phone: string,
  message: string
): Promise<WhatsAppSendResult> {
  const apiKey = env.WHATSAPP_API_KEY;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiKey || !phoneNumberId) {
    logger.warn({ phone }, "WhatsApp not configured — message queued");
    return { success: false, error: "provider_not_configured" };
  }

  // E.164 format (India: +91XXXXXXXXXX)
  const toPhone = phone.startsWith("+") ? phone : `+91${phone}`;

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toPhone,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      }
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, error: `HTTP ${resp.status}: ${errBody.slice(0, 200)}` };
    }

    const data = (await resp.json()) as any;
    const messageId = data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "network_error" };
  }
}

// ─── Email Provider (Resend) ───────────────────────────────────────────────────

interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<EmailSendResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM ?? "Matchpit <noreply@matchpit.in>";

  if (!apiKey) {
    logger.warn({ to }, "Email not configured — message queued");
    return { success: false, error: "provider_not_configured" };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, error: `HTTP ${resp.status}: ${errBody.slice(0, 200)}` };
    }

    const data = (await resp.json()) as any;
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "network_error" };
  }
}

// ─── Core: sendNotification ────────────────────────────────────────────────────

/**
 * Main Phase 4 entry point.
 *
 * Dispatch a notification to one or more channels with idempotency guarantees.
 *
 * @example
 * await sendNotification({
 *   userId: player.id,
 *   templateKey: "match_confirmed",
 *   vars: { name: "Ali", matchTitle: "Sunday 5-a-side", matchDate: "25 May", venue: "Arena" },
 *   referenceId: match.id,
 *   channels: ["in_app", "whatsapp", "email"],
 * });
 */
export async function sendNotification(
  opts: NotificationOptions
): Promise<SendResult[]> {
  const {
    userId,
    templateKey,
    vars = {},
    referenceId,
    channels = ["in_app"],
  } = opts;

  if (!ENABLE_NOTIFICATIONS) {
    logger.debug({ userId, templateKey }, "Notifications disabled — skipped");
    return channels.map((ch) => ({ channel: ch, outcome: "feature_disabled" }));
  }

  // Fetch profile for phone/email
  const [profile] = await db
    .select({ phone: profilesTable.phone, email: profilesTable.email, fullName: profilesTable.fullName })
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  if (!profile) {
    logger.warn({ userId }, "sendNotification: profile not found");
    return channels.map((ch) => ({ channel: ch, outcome: "failed" }));
  }

  // Merge profile name into vars
  const enrichedVars: NotificationVars = { name: profile.fullName, ...vars };

  const results: SendResult[] = [];

  for (const channel of channels) {
    const idempotencyKey = buildIdempotencyKey(userId, templateKey, channel, referenceId);

    // ── Idempotency check ──────────────────────────────────────────────────
    const [existing] = await db
      .select({ id: notificationDispatchLogsTable.id, status: notificationDispatchLogsTable.status })
      .from(notificationDispatchLogsTable)
      .where(eq(notificationDispatchLogsTable.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing?.status === "sent") {
      logger.debug({ userId, templateKey, channel }, "Duplicate notification skipped");
      results.push({ channel, outcome: "skipped_duplicate", logId: existing.id });
      continue;
    }

    const rendered = renderTemplate(templateKey, channel, enrichedVars);
    let logId: string | undefined;

    // ── In-app ─────────────────────────────────────────────────────────────
    if (channel === "in_app") {
      try {
        const [notification] = await db
          .insert(notificationsTable)
          .values({
            userId,
            type: templateKey as any,
            title: rendered.title ?? templateKey,
            body: rendered.body,
            referenceId: referenceId ?? null,
          } as InsertNotification)
          .returning();

        const [log] = await db
          .insert(notificationDispatchLogsTable)
          .values({
            userId,
            notificationId: notification?.id ?? null,
            channel: "in_app",
            destination: "in_app",
            templateKey,
            payload: { ...enrichedVars, referenceId } as any,
            status: "sent",
            sentAt: new Date(),
            idempotencyKey,
          })
          .returning({ id: notificationDispatchLogsTable.id });

        logId = log?.id;
        results.push({ channel, outcome: "sent", logId });
      } catch (err: any) {
        logger.error({ err, userId, templateKey, channel }, "in_app dispatch failed");
        await _logFailed(userId, channel, templateKey, enrichedVars, idempotencyKey, err.message, referenceId);
        results.push({ channel, outcome: "failed" });
      }
      continue;
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────
    if (channel === "whatsapp") {
      const phone = profile.phone;
      if (!phone) {
        logger.warn({ userId }, "WhatsApp dispatch skipped — no phone on profile");
        results.push({ channel, outcome: "failed" });
        continue;
      }

      // Create queued log first
      const [log] = await db
        .insert(notificationDispatchLogsTable)
        .values({
          userId,
          channel: "whatsapp",
          destination: phone,
          templateKey,
          payload: { message: rendered.body, ...enrichedVars, referenceId } as any,
          status: "queued",
          idempotencyKey,
        })
        .returning({ id: notificationDispatchLogsTable.id });

      logId = log?.id;

      // ── Phase 8: async path ──────────────────────────────────────────────
      if (ASYNC_NOTIFICATIONS && logId) {
        const enqueued = await _enqueueNotification({
          logId,
          channel: "whatsapp",
          destination: phone,
          rendered: { body: rendered.body },
          idempotencyKey,
          referenceId,
        });
        if (enqueued) {
          results.push({ channel, outcome: "queued", logId });
          continue;
        }
        // Enqueue failed — fall through to inline send
      }

      // ── Inline fallback (sync) ───────────────────────────────────────────
      const waResult = await sendWhatsApp(phone, rendered.body);

      if (waResult.success) {
        await db.update(notificationDispatchLogsTable)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(notificationDispatchLogsTable.id, logId!));
        results.push({ channel, outcome: "sent", logId });
      } else if (waResult.error === "provider_not_configured") {
        results.push({ channel, outcome: "queued", logId });
      } else {
        await db.update(notificationDispatchLogsTable)
          .set({ status: "failed", lastError: waResult.error, updatedAt: new Date() })
          .where(eq(notificationDispatchLogsTable.id, logId!));
        results.push({ channel, outcome: "failed", logId });
      }
      continue;
    }

    // ── Email ──────────────────────────────────────────────────────────────
    if (channel === "email") {
      const email = profile.email;
      if (!email) {
        logger.warn({ userId }, "Email dispatch skipped — no email on profile");
        results.push({ channel, outcome: "failed" });
        continue;
      }

      const [log] = await db
        .insert(notificationDispatchLogsTable)
        .values({
          userId,
          channel: "email",
          destination: email,
          templateKey,
          payload: { subject: rendered.subject, ...enrichedVars, referenceId } as any,
          status: "queued",
          idempotencyKey,
        })
        .returning({ id: notificationDispatchLogsTable.id });

      logId = log?.id;

      // ── Phase 8: async path ──────────────────────────────────────────────
      if (ASYNC_NOTIFICATIONS && logId) {
        const enqueued = await _enqueueNotification({
          logId,
          channel: "email",
          destination: email,
          rendered: {
            body: rendered.body,
            subject: rendered.subject,
            html: rendered.html,
          },
          idempotencyKey,
          referenceId,
        });
        if (enqueued) {
          results.push({ channel, outcome: "queued", logId });
          continue;
        }
        // Enqueue failed — fall through to inline send
      }

      // ── Inline fallback (sync) ───────────────────────────────────────────
      const emailResult = await sendEmail(email, rendered.subject ?? templateKey, rendered.html ?? rendered.body);

      if (emailResult.success) {
        await db.update(notificationDispatchLogsTable)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(notificationDispatchLogsTable.id, logId!));
        results.push({ channel, outcome: "sent", logId });
      } else if (emailResult.error === "provider_not_configured") {
        results.push({ channel, outcome: "queued", logId });
      } else {
        await db.update(notificationDispatchLogsTable)
          .set({ status: "failed", lastError: emailResult.error, updatedAt: new Date() })
          .where(eq(notificationDispatchLogsTable.id, logId!));
        results.push({ channel, outcome: "failed", logId });
      }
      continue;
    }
  }

  return results;
}

// ─── Phase 8: Async enqueue helper ────────────────────────────────────────────

export interface NotificationJobPayload {
  logId: string;
  channel: "whatsapp" | "email";
  destination: string;
  rendered: {
    body: string;
    subject?: string;
    html?: string;
  };
  idempotencyKey: string;
  referenceId?: string;
  executionId?: string;
}

import { writeJobStart, writeEnqueueFailed } from "../queues/job-executions";

/**
 * Attempt to enqueue a notification job to BullMQ.
 * Returns true if successfully enqueued, false if Redis is unavailable (fallback to inline).
 * Enqueue failures are non-fatal — never throws.
 */
async function _enqueueNotification(
  payload: Omit<NotificationJobPayload, "executionId">
): Promise<boolean> {
  const executionId = await writeJobStart(
    "notifications",
    `notify-${payload.channel}`,
    payload.idempotencyKey,
    payload.referenceId
  );

  try {
    // Lazy import to avoid loading BullMQ in environments where Redis is absent
    const { notificationsQueue } = await import("../queues/queues");
    await notificationsQueue().add(
      `send-${payload.channel}`,
      { ...payload, executionId },
      { jobId: payload.idempotencyKey } // Deduplication key
    );
    return true;
  } catch (err) {
    logger.warn({ err, channel: payload.channel }, "Notification enqueue failed — falling back to inline send");
    await writeEnqueueFailed(executionId, err);
    return false;
  }
}

// ─── Retry Queue ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

/**
 * Cron worker: retry failed dispatches up to MAX_RETRIES times.
 * Safe to call repeatedly — stops when all retried or max reached.
 *
 * Returns: { retried, succeeded, exhausted }
 */
export async function processFailedNotifications(): Promise<{
  retried: number;
  succeeded: number;
  exhausted: number;
}> {
  const failed = await db
    .select()
    .from(notificationDispatchLogsTable)
    .where(
      and(
        eq(notificationDispatchLogsTable.status, "failed"),
        lt(notificationDispatchLogsTable.retryCount, MAX_RETRIES)
      )
    );

  let succeeded = 0;
  let exhausted = 0;

  for (const log of failed) {
    const newRetryCount = log.retryCount + 1;
    const isLastRetry = newRetryCount >= MAX_RETRIES;
    let success = false;
    let error: string | undefined;

    try {
      if (log.channel === "whatsapp") {
        const payload = log.payload as any;
        const result = await sendWhatsApp(log.destination, payload?.message ?? "");
        success = result.success;
        error = result.error;
      } else if (log.channel === "email") {
        const payload = log.payload as any;
        const result = await sendEmail(log.destination, payload?.subject ?? "Matchpit", payload?.html ?? "");
        success = result.success;
        error = result.error;
      }
    } catch (err: any) {
      error = err?.message ?? "retry_error";
    }

    if (success) {
      await db.update(notificationDispatchLogsTable)
        .set({ status: "sent", sentAt: new Date(), retryCount: newRetryCount, updatedAt: new Date() })
        .where(eq(notificationDispatchLogsTable.id, log.id));
      succeeded++;
    } else {
      await db.update(notificationDispatchLogsTable)
        .set({
          retryCount: newRetryCount,
          lastError: error,
          status: isLastRetry ? "failed" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(notificationDispatchLogsTable.id, log.id));
      if (isLastRetry) exhausted++;
    }
  }

  logger.info({ total: failed.length, succeeded, exhausted }, "Phase 4: retry cron complete");
  return { retried: failed.length, succeeded, exhausted };
}

// ─── Delivery Confirmation (webhook callback) ──────────────────────────────────

/**
 * Mark a dispatch log as delivered based on provider callback.
 * Used by POST /webhooks/notifications.
 */
export async function markDelivered(logId: string): Promise<boolean> {
  const result = await db
    .update(notificationDispatchLogsTable)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notificationDispatchLogsTable.id, logId),
        eq(notificationDispatchLogsTable.status, "queued")
      )
    );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Mark a dispatch log as failed based on provider callback.
 */
export async function markFailed(logId: string, reason: string): Promise<boolean> {
  const result = await db
    .update(notificationDispatchLogsTable)
    .set({ status: "failed", lastError: reason, updatedAt: new Date() })
    .where(eq(notificationDispatchLogsTable.id, logId));

  return (result.rowCount ?? 0) > 0;
}

// ─── Backward-compatible createNotification helper ────────────────────────────

export { createNotification };

async function createNotification(data: InsertNotification) {
  const [notification] = await db
    .insert(notificationsTable)
    .values(data)
    .returning();
  return notification;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function _logFailed(
  userId: string,
  channel: string,
  templateKey: string,
  vars: NotificationVars,
  idempotencyKey: string,
  error: string,
  referenceId?: string
) {
  try {
    await db.insert(notificationDispatchLogsTable).values({
      userId,
      channel: channel as any,
      destination: channel,
      templateKey,
      payload: { ...vars, referenceId } as any,
      status: "failed",
      lastError: error,
      idempotencyKey,
    });
  } catch (_) {}
}
