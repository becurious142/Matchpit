import { Worker, type Job } from "bullmq";
import { getWorkerConnection } from "../redis";
import { logger } from "../../lib/logger";
import { db } from "@workspace/db";
import { paymentRefundsTable, paymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeJobProcessing, writeJobComplete, writeJobFailed, writeJobExhausted } from "../job-executions";
import { razorpay } from "../../lib/razorpay";
import { creditWallet } from "../../lib/wallet";
import { sendSlackAlert } from "../../lib/slack";
import { sendNotification } from "../../lib/notifications";

export interface RefundPayload {
  refundId: string;
  executionId?: string;
}

export async function processRefund(job: Job<RefundPayload>) {
  const { refundId, executionId } = job.data;
  
  if (executionId) await writeJobProcessing(executionId);

  try {
    // 1. Fetch refund record and payment record
    const [refundRecord] = await db
      .select({
        refund: paymentRefundsTable,
        payment: paymentsTable,
      })
      .from(paymentRefundsTable)
      .innerJoin(paymentsTable, eq(paymentRefundsTable.paymentId, paymentsTable.id))
      .where(eq(paymentRefundsTable.id, refundId));

    if (!refundRecord) {
      throw new Error(`Refund record not found in DB: ${refundId}`);
    }

    const { refund, payment } = refundRecord;

    // Idempotency: skip if already processed
    if (
      refund.status === "wallet_completed" || 
      refund.status === "gateway_completed" || 
      refund.status === "partial_completed" || 
      refund.status === "failed"
    ) {
      logger.info({ refundId }, "Refund already in terminal state. Skipping.");
      if (executionId) await writeJobComplete(executionId, Date.now() - job.timestamp);
      return;
    }

    const gatewayAmountPaise = Math.round(Number(refund.gatewayRefundAmount) * 100);
    
    // 2. Execute refund via Razorpay (Sync REST Call)
    if (!razorpay) throw new Error("Razorpay not configured in environment");
    if (!payment.razorpayPaymentId) throw new Error("Payment missing razorpayPaymentId");

    try {
      const rzpResponse = await razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: gatewayAmountPaise,
        notes: { refundId: refund.id }
      });

      // Update success
      await db.transaction(async (tx: any) => {
        await tx.update(paymentRefundsTable).set({
          status: refund.refundMode === "hybrid" ? "partial_completed" : "gateway_completed",
          providerRefundId: rzpResponse.id,
          providerResponse: rzpResponse as any
        }).where(eq(paymentRefundsTable.id, refund.id));

        if (refund.refundMode === "hybrid") {
          await creditWallet(
            tx as any,
            payment.userId,
            Number(refund.walletRefundAmount),
            "Partial refund to wallet",
            payment.id
          );
        }
      });
      
      logger.info({ refundId, providerRefundId: rzpResponse.id }, "Refund processed successfully");
      
    } catch (err: any) {
      logger.error({ err, jobId: job.id, refundId }, "Razorpay refund API call failed");
      
      // Fallback logic
      await db.transaction(async (tx: any) => {
        await tx.update(paymentRefundsTable).set({
          status: "wallet_completed",
          failureReason: err.message || "Unknown Razorpay Error",
          walletRefundAmount: refund.amount // Entire amount goes to wallet on failure
        }).where(eq(paymentRefundsTable.id, refund.id));

        await creditWallet(
          tx as any,
          payment.userId,
          Number(refund.amount),
          "Refund fallback to wallet",
          payment.id
        );
      });

      // Notify User
      await sendNotification({
        userId: payment.userId,
        templateKey: "wallet_fallback_refund",
        vars: { amount: refund.amount },
        channels: ["in_app", "email"],
      });

      // Notify Admins
      await sendSlackAlert(
        "Refund Gateway Fallback",
        `Failed to refund ₹${refund.gatewayRefundAmount} via Razorpay. Successfully fell back to wallet credit.`,
        "warning",
        { paymentId: payment.id, amount: refund.amount, error: err.message }
      );
      
      // We consider the job successful because we gracefully fell back to wallet!
      logger.info({ refundId }, "Refund gracefully fell back to wallet.");
    }

    if (executionId) {
      await writeJobComplete(executionId, Date.now() - job.timestamp);
    }
  } catch (err: any) {
    logger.error({ err, jobId: job.id, refundId }, "Refund worker failed fundamentally");
    
    // Determine if terminal
    const isTerminal = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

    if (executionId) {
      if (isTerminal) {
        await writeJobExhausted(executionId, err, job.attemptsMade + 1);
        
        await db
          .update(paymentRefundsTable)
          .set({
            status: "failed",
            failureReason: err.message?.substring(0, 255),
            updatedAt: new Date(),
          })
          .where(eq(paymentRefundsTable.id, refundId));
          
      } else {
        await writeJobFailed(executionId, err, job.attemptsMade + 1);
      }
    }

    throw err; // Trigger retry for fundamental issues (e.g. DB connection lost)
  }
}

export function createRefundWorker() {
  const worker = new Worker<RefundPayload>(
    "refunds",
    processRefund,
    {
      connection: getWorkerConnection(),
      concurrency: 2, // Refunds are low throughput, high value
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "refunds job failed");
  });

  return worker;
}

export async function closeRefundWorker(worker: Worker) {
  await worker.close();
}
