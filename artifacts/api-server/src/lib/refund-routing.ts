import { db, paymentRefundsTable, paymentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { razorpay } from "./razorpay";
import { creditWallet } from "./wallet";
import { sendSlackAlert } from "./slack";
import { sendNotification } from "./notifications";

type AnyDb = typeof db;

export async function refundPayment(
  paymentId: string,
  amount: number,
  idempotencyKey: string,
  dbInstance: AnyDb = db
): Promise<any> {
  // Use transaction to safely reserve the refund amount
  const result = await dbInstance.transaction(async (tx: any) => {
    // 1. Idempotency Check
    const existing = await tx.query.paymentRefundsTable.findFirst({
      where: (r: any, { eq }: any) => eq(r.idempotencyKey, idempotencyKey),
    });
    if (existing) return { existing: true, refund: existing };

    // 2. Fetch Payment
    const payment = await tx.query.paymentsTable.findFirst({
      where: (p: any, { eq }: any) => eq(p.id, paymentId),
    });
    if (!payment) throw new Error(`Payment ${paymentId} not found`);

    const gross = Number(payment.grossAmount);
    const refundedSoFar = Number(payment.refundComponent);
    if (refundedSoFar + amount > gross) {
      throw new Error(`Cannot refund ${amount}. Only ${gross - refundedSoFar} remaining on payment.`);
    }

    // 3. Routing Rules
    const gatewayUsed = Number(payment.grossAmount) - Number(payment.walletComponent);
    const remainingGatewayAmount = Math.max(0, gatewayUsed - refundedSoFar);

    let route: "wallet" | "gateway" | "hybrid" = "wallet";
    let gatewayRefundAmount = 0;
    let walletRefundAmount = amount;

    // ₹500 is the threshold for Razorpay refunds
    if (amount >= 500 && remainingGatewayAmount > 0) {
      gatewayRefundAmount = Math.min(amount, remainingGatewayAmount);
      walletRefundAmount = amount - gatewayRefundAmount;
      route = walletRefundAmount > 0 ? "hybrid" : "gateway";
    }

    // 4. Insert Audit Record
    const [refund] = await tx.insert(paymentRefundsTable).values({
      paymentId,
      userId: payment.userId,
      amount: amount.toString(),
      refundMode: route,
      gatewayRefundAmount: gatewayRefundAmount.toString(),
      walletRefundAmount: walletRefundAmount.toString(),
      status: route === "wallet" ? "wallet_completed" : "gateway_processing",
      idempotencyKey,
    }).returning();

    // 5. Reserve amount on Payment
    await tx.update(paymentsTable)
      .set({
        refundComponent: sql`${paymentsTable.refundComponent} + ${amount}`,
        status: (refundedSoFar + amount === gross) ? "refunded" : "partially_refunded"
      })
      .where(eq(paymentsTable.id, paymentId));

    // 6. Complete Wallet Route inside tx
    if (route === "wallet") {
      await creditWallet(
        tx as any,
        payment.userId,
        amount,
        "Payment refund",
        payment.id
      );
    }

    return { existing: false, refund, route, payment };
  });

  if (result.existing) return result.refund;

  // Execute Gateway/Hybrid route OUTSIDE the transaction
  if (result.route === "gateway" || result.route === "hybrid") {
    const { refund } = result;

    try {
      const { refundsQueue } = await import("../queues/queues");
      const { writeJobStart, writeEnqueueFailed } = await import("../queues/job-executions");

      const executionId = await writeJobStart(
        "refunds",
        "process-refund",
        null,
        refund.id,
        { refundId: refund.id }
      );

      try {
        const queue = refundsQueue();
        const job = await queue.add("process-refund", { refundId: refund.id, executionId });
        await dbInstance.update(paymentRefundsTable).set({ 
           status: "gateway_processing"
        }).where(eq(paymentRefundsTable.id, refund.id));
        
        await import("../queues/job-executions").then(({ writeJobProcessing }) => {
           // We'll just let the worker mark it processing. But we can save the bullmqJobId.
        });
        const { jobExecutionsTable } = await import("@workspace/db");
        await dbInstance.update(jobExecutionsTable).set({ bullmqJobId: job.id }).where(eq(jobExecutionsTable.id, executionId));
        console.log(`[Refund] Enqueued refund ${refund.id} to BullMQ`);
      } catch (err) {
        await writeEnqueueFailed(executionId, err);
        console.error("[Refund] Failed to enqueue refund to BullMQ:", err);
      }
    } catch (err) {
      console.error("[Refund] Failed to initialize audit for refund:", err);
    }
  }

  // Return final state
  const finalRefund = await dbInstance.query.paymentRefundsTable.findFirst({
    where: (r: any, { eq }: any) => eq(r.id, result.refund.id)
  });
  return finalRefund;
}

export async function refundUserForReference(
  userId: string,
  referenceId: string,
  referenceType: "booking" | "hosted_match" | "reservation",
  amount: number,
  idempotencyKey: string,
  dbInstance: AnyDb = db
): Promise<void> {
  const payments = await dbInstance.query.paymentsTable.findMany({
    where: (p: any, { eq, and, inArray }: any) => and(
      eq(p.referenceId, referenceId),
      eq(p.userId, userId),
      inArray(p.status, ["payment_captured", "partially_refunded"])
    ),
    orderBy: (p: any, { desc }: any) => desc(p.createdAt)
  });

  let remainingToRefund = amount;
  for (const payment of payments) {
    if (remainingToRefund <= 0) break;
    const gross = Number(payment.grossAmount);
    const refunded = Number(payment.refundComponent);
    const refundableForPayment = gross - refunded;
    
    if (refundableForPayment <= 0) continue;

    const amountToRefund = Math.min(refundableForPayment, remainingToRefund);
    await refundPayment(
      payment.id,
      amountToRefund,
      `${idempotencyKey}_${payment.id}`,
      dbInstance
    );
    remainingToRefund -= amountToRefund;
  }

  if (remainingToRefund > 0) {
    // If not enough payment components exist, credit remainder directly to wallet.
    await creditWallet(
      dbInstance,
      userId,
      remainingToRefund,
      "Fallback refund for reference",
      referenceId
    );
  }
}

export async function processUnderfillRefund(
  userId: string,
  matchId: string,
  amount: number,
): Promise<void> {
  const idempotencyKey = `cancel_underfill_${matchId}_${userId}`;
  await refundUserForReference(
    userId,
    matchId,
    "hosted_match",
    amount,
    idempotencyKey
  );
}

export async function processCancellationRefund(
  userId: string,
  referenceId: string,
  referenceType: "booking" | "hosted_match",
  amount: number,
  txDb?: AnyDb,
): Promise<void> {
  const idempotencyKey = `cancel_${referenceType}_${referenceId}_${userId}`;
  await refundUserForReference(
    userId,
    referenceId,
    referenceType,
    amount,
    idempotencyKey,
    txDb
  );
}
