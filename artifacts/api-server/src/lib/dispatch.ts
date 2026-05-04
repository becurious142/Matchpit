import { db } from "@workspace/db";
import { notificationDispatchLogsTable } from "@workspace/db";
import { createNotification } from "./notifications";
import { logger } from "./logger";

export type DispatchChannel = "in_app" | "whatsapp" | "sms";

export interface DispatchPayload {
  title?: string;
  body: string;
  link?: string;
  [key: string]: unknown;
}

export async function dispatchNotification(
  userId: string,
  templateKey: string,
  payload: DispatchPayload,
  preferredChannels: DispatchChannel[] = ["in_app"]
): Promise<void> {
  for (const channel of preferredChannels) {
    try {
      if (channel === "in_app") {
        const notification = await createNotification({
          userId,
          type: templateKey as any,
          title: payload.title ?? templateKey,
          body: payload.body,
        });
        await db.insert(notificationDispatchLogsTable).values({
          userId,
          notificationId: notification?.id ?? null,
          channel: "in_app",
          destination: "in_app",
          templateKey,
          payload: payload as any,
          status: "sent",
        });
      } else if (channel === "whatsapp") {
        await db.insert(notificationDispatchLogsTable).values({
          userId,
          channel: "whatsapp",
          destination: "whatsapp_pending",
          templateKey,
          payload: payload as any,
          status: "queued",
        });
      } else if (channel === "sms") {
        await db.insert(notificationDispatchLogsTable).values({
          userId,
          channel: "sms",
          destination: "sms_pending",
          templateKey,
          payload: payload as any,
          status: "queued",
        });
      }
    } catch (err) {
      logger.error({ err, userId, channel, templateKey }, "Dispatch error");
      try {
        await db.insert(notificationDispatchLogsTable).values({
          userId,
          channel: channel as any,
          destination: channel,
          templateKey,
          payload: payload as any,
          status: "failed",
        });
      } catch (_) {}
    }
  }
}

export const TEMPLATES = {
  BOOKING_CONFIRMED: "booking_confirmed",
  HOST_COMMITMENT: "host_commitment",
  RESERVE_JOINED: "reserve_joined",
  FINAL_PAYMENT_DUE: "final_payment_due",
  MATCH_CONFIRMED: "match_confirmed",
  MATCH_ALMOST_FULL: "match_almost_full",
  NUDGE_UNPAID: "nudge_unpaid",
  SQUAD_CHALLENGE_ACCEPTED: "squad_challenge_accepted",
  REFERRAL_REWARD_EARNED: "referral_reward_earned",
  WALLET_REFUND_ISSUED: "wallet_refund_issued",
} as const;
