import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@workspace/db";
import { paymentRefundsTable, paymentsTable, jobExecutionsTable, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { processRefund } from "../../src/queues/workers/refund.worker";
import crypto from "crypto";

// Mock razorpay
vi.mock("../../src/lib/razorpay", () => ({
  razorpay: {
    payments: {
      refund: vi.fn().mockResolvedValue({ id: "rzp_refund_mock_123" })
    }
  }
}));

// Mock wallet
vi.mock("../../src/lib/wallet", () => ({
  creditWallet: vi.fn().mockResolvedValue(undefined)
}));

// Mock notifications & slack
vi.mock("../../src/lib/notifications", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("../../src/lib/slack", () => ({
  sendSlackAlert: vi.fn().mockResolvedValue(undefined)
}));

describe("Phase 8B: Refund Worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it("skips processing if refund is already in terminal state", async () => {
    const userId = crypto.randomUUID();
    await db.insert(profilesTable).values({
      id: userId,
      clerkId: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
      phone: `+91${Math.floor(Math.random() * 10000000000)}`,
      fullName: "Test User 1"
    });
    const paymentId = crypto.randomUUID();
    await db.insert(paymentsTable).values({
      id: paymentId,
      userId: userId,
      type: "match_join",
      amount: 1000,
      grossAmount: 1000,
      status: "payment_captured",
      razorpayOrderId: "order_123",
      razorpayPaymentId: "pay_123",
    });

    const refundId = crypto.randomUUID();
    await db.insert(paymentRefundsTable).values({
      id: refundId,
      paymentId: paymentId,
      userId: userId,
      amount: "1000",
      refundMode: "gateway",
      status: "gateway_completed", // terminal
      idempotencyKey: `test_idem_1_${crypto.randomUUID()}`,
    });

    const jobMock = {
      id: "job-1",
      data: { refundId },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    await processRefund(jobMock);

    // Verify it was skipped (no error thrown, no Razorpay call)
    const { razorpay } = await import("../../src/lib/razorpay");
    expect(razorpay?.payments.refund).not.toHaveBeenCalled();
  });

  it("processes gateway refund and marks as gateway_completed", async () => {
    const userId = crypto.randomUUID();
    await db.insert(profilesTable).values({
      id: userId,
      clerkId: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
      phone: `+91${Math.floor(Math.random() * 10000000000)}`,
      fullName: "Test User 2"
    });
    const paymentId = crypto.randomUUID();
    await db.insert(paymentsTable).values({
      id: paymentId,
      userId: userId,
      type: "match_join",
      amount: 500,
      grossAmount: 500,
      status: "payment_captured",
      razorpayOrderId: "order_2",
      razorpayPaymentId: "pay_2",
    });

    const refundId = crypto.randomUUID();
    await db.insert(paymentRefundsTable).values({
      id: refundId,
      paymentId: paymentId,
      userId: userId,
      amount: "500",
      gatewayRefundAmount: "500",
      walletRefundAmount: "0",
      refundMode: "gateway",
      status: "gateway_processing",
      idempotencyKey: `test_idem_2_${crypto.randomUUID()}`,
    });

    const jobMock = {
      id: "job-2",
      data: { refundId },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    await processRefund(jobMock);

    const { razorpay } = await import("../../src/lib/razorpay");
    expect(razorpay?.payments.refund).toHaveBeenCalledWith("pay_2", { amount: 50000, notes: { refundId } });

    // Verify DB update
    const [updatedRefund] = await db.select().from(paymentRefundsTable).where(eq(paymentRefundsTable.id, refundId));
    expect(updatedRefund.status).toBe("gateway_completed");
    expect(updatedRefund.providerRefundId).toBe("rzp_refund_mock_123");
  });

  it("falls back to wallet if Razorpay throws an error", async () => {
    const userId = crypto.randomUUID();
    await db.insert(profilesTable).values({
      id: userId,
      clerkId: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
      phone: `+91${Math.floor(Math.random() * 10000000000)}`,
      fullName: "Test User 3"
    });
    const paymentId = crypto.randomUUID();
    await db.insert(paymentsTable).values({
      id: paymentId,
      userId: userId,
      type: "match_join",
      amount: 500,
      grossAmount: 500,
      status: "payment_captured",
      razorpayOrderId: "order_3",
      razorpayPaymentId: "pay_3",
    });

    const refundId = crypto.randomUUID();
    await db.insert(paymentRefundsTable).values({
      id: refundId,
      paymentId: paymentId,
      userId: userId,
      amount: "500",
      gatewayRefundAmount: "500",
      walletRefundAmount: "0",
      refundMode: "gateway",
      status: "gateway_processing",
      idempotencyKey: `test_idem_3_${crypto.randomUUID()}`,
    });

    const jobMock = {
      id: "job-3",
      data: { refundId },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any;

    const { razorpay } = await import("../../src/lib/razorpay");
    vi.mocked(razorpay!.payments.refund).mockRejectedValueOnce(new Error("API Down"));

    await processRefund(jobMock);

    // Job doesn't throw because it gracefully fell back
    const { creditWallet } = await import("../../src/lib/wallet");
    expect(creditWallet).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      500,
      "Refund fallback to wallet",
      paymentId
    );

    // Verify DB update
    const [updatedRefund] = await db.select().from(paymentRefundsTable).where(eq(paymentRefundsTable.id, refundId));
    expect(updatedRefund.status).toBe("wallet_completed");
    expect(updatedRefund.failureReason).toContain("API Down");
  });
});
