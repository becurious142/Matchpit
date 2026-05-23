/**
 * Phase 6 — Refund Routing Integration Tests
 *
 * Covers:
 *  1. Idempotency — duplicate key returns existing record without re-processing
 *  2. Wallet route — small amounts (< ₹500) routed 100% to wallet
 *  3. Gateway route — ≥ ₹500 with sufficient gateway balance routed to Razorpay
 *  4. Hybrid route — partial gateway + wallet split
 *  5. Fallback — Razorpay failure credits full amount to wallet
 *  6. Race condition — overfill rejection when amount > remaining
 *  7. refundUserForReference — multi-payment allocation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@workspace/db";
import { paymentRefundsTable, paymentsTable, walletLedgerTable } from "@workspace/db";
import { eq, and, sum } from "drizzle-orm";

import { seedUser, seedPayment, testRegistry } from "./setup";

// ─── Module Mocks ─────────────────────────────────────────────────────────────
// Mock external integrations so tests don't require live Razorpay / Slack

vi.mock("../src/lib/razorpay", () => ({
  razorpay: {
    payments: {
      refund: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/slack", () => ({
  sendSlackAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/notifications", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { razorpay } from "../src/lib/razorpay";
import { sendSlackAlert } from "../src/lib/slack";
import { sendNotification } from "../src/lib/notifications";
import { refundPayment, refundUserForReference } from "../src/lib/refund-routing";

const mockRazorpay = razorpay as unknown as {
  payments: { refund: ReturnType<typeof vi.fn> };
};

/** Seed a captured payment with the given grossAmount, gatewayAmount split */
async function seedCapturedPayment(
  userId: string,
  grossAmount: number,
  razorpayPaymentId: string | null = "pay_test_rzp"
) {
  const [payment] = await db
    .insert(paymentsTable)
    .values({
      userId,
      type: "match_reserve",
      referenceId: null,
      razorpayOrderId: `order_${crypto.randomUUID().slice(0, 8)}`,
      razorpayPaymentId,
      amount: String(grossAmount),
      grossAmount,
      walletComponent: 0, // full amount paid via gateway by default
      status: "payment_captured",
      reviewStatus: "none",
    })
    .returning();
  testRegistry.paymentIds.push(payment.id);
  return payment;
}

/** Clean up refund rows created during a test by paymentId */
async function cleanupRefundsFor(paymentId: string) {
  await db
    .delete(paymentRefundsTable)
    .where(eq(paymentRefundsTable.paymentId, paymentId));
}

// ─── 1. Idempotency ────────────────────────────────────────────────────────────
describe("Refund Routing — Idempotency", () => {
  it("calling refundPayment twice with the same key returns the existing record without duplication", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const payment = await seedCapturedPayment(user.id, 200); // < 500 → wallet route

    const key = `idem_test_${crypto.randomUUID()}`;

    const first = await refundPayment(payment.id, 100, key);
    const second = await refundPayment(payment.id, 100, key);

    expect(first.id).toBe(second.id);

    // Only one refund row should exist
    const rows = await db
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.idempotencyKey, key));
    expect(rows.length).toBe(1);

    await cleanupRefundsFor(payment.id);
  });

  it("duplicate key does not modify payment.refundComponent a second time", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const payment = await seedCapturedPayment(user.id, 300);
    const key = `idem_rc_${crypto.randomUUID()}`;

    await refundPayment(payment.id, 150, key);
    await refundPayment(payment.id, 150, key); // second call — idempotent

    const [updated] = await db
      .select({ refundComponent: paymentsTable.refundComponent })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, payment.id));

    // Should still be 150, not 300
    expect(Number(updated.refundComponent)).toBe(150);

    await cleanupRefundsFor(payment.id);
  });
});

// ─── 2. Wallet Route (< ₹500) ─────────────────────────────────────────────────
describe("Refund Routing — Wallet Route", () => {
  beforeEach(() => {
    mockRazorpay.payments.refund.mockClear();
  });

  it("amounts below ₹500 are routed entirely to wallet without calling Razorpay", async () => {
    const user = await seedUser({ walletBalance: "100" });
    const payment = await seedCapturedPayment(user.id, 300);
    const key = `wallet_route_${crypto.randomUUID()}`;

    const refund = await refundPayment(payment.id, 200, key);

    expect(refund.refundMode).toBe("wallet");
    expect(refund.status).toBe("wallet_completed");
    expect(mockRazorpay.payments.refund).not.toHaveBeenCalled();

    // Wallet ledger should have a credit entry
    const credits = await db
      .select()
      .from(walletLedgerTable)
      .where(
        and(
          eq(walletLedgerTable.userId, user.id),
          eq(walletLedgerTable.referenceId, payment.id)
        )
      );
    const creditEntry = credits.find((c) => Number(c.amount) > 0);
    expect(creditEntry).toBeDefined();
    expect(Number(creditEntry!.amount)).toBeGreaterThanOrEqual(200);

    testRegistry.ledgerEntryIds.push(...credits.map((c) => c.id));
    await cleanupRefundsFor(payment.id);
  });
});

// ─── 3. Gateway Route (≥ ₹500, full gateway) ──────────────────────────────────
describe("Refund Routing — Gateway Route", () => {
  beforeEach(() => {
    mockRazorpay.payments.refund.mockResolvedValue({
      id: `rfnd_mock_${crypto.randomUUID().slice(0, 8)}`,
      status: "processed",
    });
  });

  afterEach(() => {
    mockRazorpay.payments.refund.mockReset();
  });

  it("amounts ≥ ₹500 with full gateway balance are routed to Razorpay", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const payment = await seedCapturedPayment(user.id, 1000);
    const key = `gateway_route_${crypto.randomUUID()}`;

    const refund = await refundPayment(payment.id, 600, key);

    expect(refund.refundMode).toBe("gateway");
    expect(refund.status).toBe("gateway_completed");
    expect(mockRazorpay.payments.refund).toHaveBeenCalledOnce();

    const callArgs = mockRazorpay.payments.refund.mock.calls[0];
    expect(callArgs[0]).toBe(payment.razorpayPaymentId);
    // Amount passed to Razorpay is in paise
    expect(callArgs[1].amount).toBe(600 * 100);

    await cleanupRefundsFor(payment.id);
  });
});

// ─── 4. Hybrid Route ──────────────────────────────────────────────────────────
describe("Refund Routing — Hybrid Route", () => {
  beforeEach(() => {
    mockRazorpay.payments.refund.mockResolvedValue({
      id: `rfnd_hyb_${crypto.randomUUID().slice(0, 8)}`,
      status: "processed",
    });
  });

  afterEach(() => {
    mockRazorpay.payments.refund.mockReset();
  });

  it("refund exceeding gateway balance splits correctly — gateway + wallet", async () => {
    const user = await seedUser({ walletBalance: "200" });

    // Payment: ₹800 total, ₹500 via gateway, ₹300 via wallet
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        userId: user.id,
        type: "match_reserve",
        referenceId: null,
        razorpayOrderId: `order_hyb_${crypto.randomUUID().slice(0, 8)}`,
        razorpayPaymentId: "pay_hybrid_test",
        amount: "800",
        grossAmount: 800,
        walletComponent: 300, // Only ₹500 went through gateway
        status: "payment_captured",
        reviewStatus: "none",
      })
      .returning();
    testRegistry.paymentIds.push(payment.id);

    const key = `hybrid_${crypto.randomUUID()}`;
    // Refund full ₹800 → ₹500 gateway + ₹300 wallet
    const refund = await refundPayment(payment.id, 800, key);

    expect(refund.refundMode).toBe("hybrid");
    expect(refund.status).toBe("partial_completed");
    expect(Number(refund.gatewayRefundAmount)).toBe(500);
    expect(Number(refund.walletRefundAmount)).toBe(300);

    // Razorpay called for gateway portion only (in paise)
    expect(mockRazorpay.payments.refund).toHaveBeenCalledOnce();
    const callArgs = mockRazorpay.payments.refund.mock.calls[0];
    expect(callArgs[1].amount).toBe(500 * 100);

    const credits = await db
      .select()
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.userId, user.id));
    testRegistry.ledgerEntryIds.push(...credits.map((c) => c.id));

    await cleanupRefundsFor(payment.id);
  });
});

// ─── 5. Gateway Failure → Wallet Fallback ─────────────────────────────────────
describe("Refund Routing — Gateway Fallback", () => {
  beforeEach(() => {
    mockRazorpay.payments.refund.mockRejectedValue(
      new Error("Razorpay API timeout")
    );
    vi.mocked(sendSlackAlert).mockResolvedValue(undefined);
    vi.mocked(sendNotification).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    mockRazorpay.payments.refund.mockReset();
    vi.mocked(sendSlackAlert).mockReset();
    vi.mocked(sendNotification).mockReset();
  });

  it("when Razorpay throws, full amount is credited to wallet and refund marked wallet_completed", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const payment = await seedCapturedPayment(user.id, 700);
    const key = `fallback_${crypto.randomUUID()}`;

    const refund = await refundPayment(payment.id, 700, key);

    expect(refund.status).toBe("wallet_completed");
    expect(refund.failureReason).toBeTruthy();

    // Slack + notification should be fired
    expect(sendSlackAlert).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        templateKey: "wallet_fallback_refund",
      })
    );

    const credits = await db
      .select()
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.userId, user.id));
    testRegistry.ledgerEntryIds.push(...credits.map((c) => c.id));

    const totalCredit = credits.reduce(
      (acc, c) => acc + Number(c.amount),
      0
    );
    expect(totalCredit).toBeGreaterThanOrEqual(700);

    await cleanupRefundsFor(payment.id);
  });
});

// ─── 6. Race Condition — Overfill Rejection ────────────────────────────────────
describe("Refund Routing — Overfill Protection", () => {
  it("rejects a refund that would exceed the payment's gross amount", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const payment = await seedCapturedPayment(user.id, 300);
    const key1 = `over_a_${crypto.randomUUID()}`;
    const key2 = `over_b_${crypto.randomUUID()}`;

    await refundPayment(payment.id, 200, key1);

    // Second call tries to refund 200 more — but only 100 remains
    await expect(refundPayment(payment.id, 200, key2)).rejects.toThrow(
      /cannot refund/i
    );

    await cleanupRefundsFor(payment.id);
  });

  it("rejects a refund larger than the gross amount in a single call", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const payment = await seedCapturedPayment(user.id, 500);
    const key = `over_single_${crypto.randomUUID()}`;

    await expect(refundPayment(payment.id, 600, key)).rejects.toThrow(
      /cannot refund/i
    );

    await cleanupRefundsFor(payment.id);
  });
});

// ─── 7. refundUserForReference — Multi-Payment Allocation ──────────────────────
describe("Refund Routing — refundUserForReference", () => {
  beforeEach(() => {
    // Default: wallet route (no Razorpay call needed for small amounts)
    mockRazorpay.payments.refund.mockResolvedValue({ id: "rfnd_ref_mock" });
  });

  afterEach(() => {
    mockRazorpay.payments.refund.mockReset();
  });

  it("allocates refund across multiple payments for the same reference", async () => {
    const user = await seedUser({ walletBalance: "0" });
    const referenceId = crypto.randomUUID();

    // Two payments for the same match
    const [p1] = await db
      .insert(paymentsTable)
      .values({
        userId: user.id,
        type: "match_reserve",
        referenceId,
        razorpayOrderId: `order_ref1_${crypto.randomUUID().slice(0, 6)}`,
        razorpayPaymentId: null,
        amount: "49",
        grossAmount: 49,
        walletComponent: 49,
        status: "payment_captured",
        reviewStatus: "none",
      })
      .returning();
    const [p2] = await db
      .insert(paymentsTable)
      .values({
        userId: user.id,
        type: "match_final",
        referenceId,
        razorpayOrderId: `order_ref2_${crypto.randomUUID().slice(0, 6)}`,
        razorpayPaymentId: null,
        amount: "300",
        grossAmount: 300,
        walletComponent: 300,
        status: "payment_captured",
        reviewStatus: "none",
      })
      .returning();

    testRegistry.paymentIds.push(p1.id, p2.id);

    const key = `ref_multi_${crypto.randomUUID()}`;
    // Total refundable: 349
    await refundUserForReference(user.id, referenceId, "hosted_match", 349, key);

    const refunds = await db
      .select()
      .from(paymentRefundsTable)
      .where(eq(paymentRefundsTable.userId, user.id));

    // At least one refund row per payment (may also have wallet fallback rows)
    expect(refunds.length).toBeGreaterThanOrEqual(1);

    const totalRefunded = refunds.reduce(
      (acc, r) => acc + Number(r.amount),
      0
    );
    expect(Math.abs(totalRefunded - 349)).toBeLessThan(1);

    for (const r of refunds) {
      await cleanupRefundsFor(r.paymentId);
    }
  });
});
