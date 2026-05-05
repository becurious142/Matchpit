import { db } from "@workspace/db";
import { analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";

export async function trackEvent(
  eventName: string,
  userId?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      eventName,
      userId: userId ?? null,
      meta: meta ?? {},
    });
  } catch (err) {
    logger.error({ err, eventName, userId }, "Analytics track error");
  }
}

export const EVENTS = {
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  REFERRAL_APPLIED: "referral_applied",
  BOOKING_STARTED: "booking_started",
  BOOKING_PAID: "booking_paid",
  HOST_MATCH_STARTED: "host_match_started",
  HOST_MATCH_PAID: "host_match_paid",
  RESERVE_JOIN_STARTED: "reserve_join_started",
  RESERVE_JOIN_PAID: "reserve_join_paid",
  FINAL_PAYMENT_STARTED: "final_payment_started",
  FINAL_PAYMENT_PAID: "final_payment_paid",
  WALLET_USED: "wallet_used",
  COUPON_APPLIED: "coupon_applied",
  COMMUNITY_POST_CREATED: "community_post_created",
  SQUAD_CREATED: "squad_created",
  SQUAD_JOINED: "squad_joined",
  FOLLOW_USER: "follow_user",
  CHAT_MESSAGE_SENT: "chat_message_sent",
  NOTIFICATION_CLICKED: "notification_clicked",
  REPORT_SUBMITTED: "report_submitted",
} as const;
