import { env } from "../config/env";
import Razorpay from "razorpay";
import crypto from "crypto";

const keyId = env.RAZORPAY_KEY_ID ?? "";
const keySecret = env.RAZORPAY_KEY_SECRET ?? "";

export const razorpay = keyId && keySecret
  ? new Razorpay({ key_id: keyId, key_secret: keySecret })
  : null;

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!keySecret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");
  return expected === signature;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) return false;
  return Razorpay.validateWebhookSignature(rawBody, signature, secret);
}

export function getRazorpayKeyId() {
  return keyId;
}
