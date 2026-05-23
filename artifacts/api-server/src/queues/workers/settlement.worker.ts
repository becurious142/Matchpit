import { Worker, Job } from "bullmq";
import { db } from "@workspace/db";
import { settlementBatchesTable, venuePayoutLedgerTable, adminAuditLogsTable } from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";
import { getWorkerConnection } from "../redis";
import { writeJobComplete, writeJobFailed, writeJobExhausted } from "../job-executions";
import { sendSlackAlert } from "../../lib/slack";

export async function processSettlementBatch(batchId: string) {
  // 1. Recheck DB State
  const [batch] = await db.select().from(settlementBatchesTable).where(eq(settlementBatchesTable.id, batchId));
  
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  // If already processed or paid, skip safely
  if (["paid", "partial_failed"].includes(batch.status)) {
    return { skipped: true, reason: "already_terminal" };
  }

  // 2. Mark batch as processing
  if (batch.status === "batched") {
    await db.update(settlementBatchesTable)
      .set({ status: "processing", processedAt: new Date() })
      .where(eq(settlementBatchesTable.id, batchId));
  }

  // 3. Chunk Loop (50 rows per chunk) with SKIP LOCKED
  const CHUNK_SIZE = 50;
  let hasMore = true;
  let successCount = 0;
  let failureCount = 0;

  while (hasMore) {
    const chunkResult = await db.transaction(async (tx) => {
      // Find rows locked to this transaction
      const rows = await tx.execute<{ id: string }>(sql`
        SELECT id FROM venue_payout_ledger
        WHERE settlement_batch_id = ${batchId}
          AND status IN ('batched', 'processing')
        FOR UPDATE SKIP LOCKED
        LIMIT ${CHUNK_SIZE}
      `);

      const idsToProcess = rows.rows.map(r => r.id);

      if (idsToProcess.length === 0) {
        return { hasMore: false };
      }

      // Mark as paid
      await tx.update(venuePayoutLedgerTable)
        .set({ status: "paid", paidAt: new Date() })
        .where(inArray(venuePayoutLedgerTable.id, idsToProcess));
        
      return { hasMore: idsToProcess.length === CHUNK_SIZE, processedCount: idsToProcess.length };
    });

    if (!chunkResult.hasMore) {
      hasMore = false;
    }
    
    if (chunkResult.processedCount) {
      successCount += chunkResult.processedCount;
    }
  }

  // 4. Check if any are still pending for this batch (meaning they failed or were skipped somehow)
  const remaining = await db.select({ id: venuePayoutLedgerTable.id })
    .from(venuePayoutLedgerTable)
    .where(
      and(
        eq(venuePayoutLedgerTable.settlementBatchId, batchId),
        inArray(venuePayoutLedgerTable.status, ["batched", "processing"])
      )
    );

  const finalStatus = remaining.length === 0 ? "paid" : "failed";

  // 5. Update batch to terminal status
  await db.update(settlementBatchesTable)
    .set({ 
      status: finalStatus, 
      settledAt: new Date(), 
      updatedAt: new Date() 
    })
    .where(eq(settlementBatchesTable.id, batchId));

  if (finalStatus === "failed") {
    throw new Error(`Batch ${batchId} completed with partial failures. ${remaining.length} payouts un-settled.`);
  }

  return { successCount };
}

let workerInstance: Worker | null = null;

export async function createSettlementWorker() {
  const connection = getWorkerConnection();
  
  workerInstance = new Worker("settlements", async (job: Job) => {
    const { batchId } = job.data;
    
    if (!batchId) {
      throw new Error("Missing batchId in job data");
    }

    return processSettlementBatch(batchId);
  }, {
    connection,
    concurrency: 1, // Global concurrency=1 to avoid lock contention
    stalledInterval: 30_000,
    maxStalledCount: 2,
    lockDuration: 60_000, // 60s lock
  });

  workerInstance.on("completed", async (job) => {
    const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    await writeJobComplete(job.id!, duration);
  });

  workerInstance.on("failed", async (job, err) => {
    if (!job) return;
    
    if (job.attemptsMade >= (job.opts.attempts || 1)) {
      await writeJobExhausted(job.id!, err, job.attemptsMade);
      await db.update(settlementBatchesTable)
        .set({ status: "failed" })
        .where(eq(settlementBatchesTable.id, job.data.batchId));
      await sendSlackAlert("Settlement Batch Exhausted", `Batch ${job.data.batchId} failed after ${job.attemptsMade} attempts.\n${err.message}`);
    } else {
      await writeJobFailed(job.id!, err, job.attemptsMade);
    }
  });

  return workerInstance;
}

export async function closeSettlementWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}
