import { Worker, type Job } from "bullmq";
import { db, fraudFlagsTable, riskEventsTable, hostedMatchesTable, referralsTable, venuePayoutLedgerTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { trackRiskMetric } from "../../lib/risk-metrics";
import type { RiskEvaluationJobData } from "../../lib/risk-engine";
import { RISK_RULE_WEIGHTS, RISK_THRESHOLDS } from "../../lib/risk-rule-config";
import { getQueueConnection } from "../redis";
import { CONCURRENCY } from "../retry-policies";

export function createRiskEvaluationWorker(): Worker<RiskEvaluationJobData> {
  const worker = new Worker<RiskEvaluationJobData>(
    "risk-evaluations",
    processRiskEvaluation,
    {
      connection: getQueueConnection(),
      concurrency: CONCURRENCY["risk-evaluations"],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Risk evaluation worker failed");
  });

  return worker;
}

export async function closeRiskEvaluationWorker(worker: Worker): Promise<void> {
  await worker.close();
}

export async function processRiskEvaluation(job: Job<RiskEvaluationJobData>): Promise<void> {
  const data = job.data;
  logger.info({ jobId: job.id, type: data.type }, "Starting risk evaluation");

  try {
    switch (data.type) {
      case "user":
        await evaluateUserRisk(data);
        break;
      case "match":
        await evaluateMatchRisk(data);
        break;
      case "referral":
        await evaluateReferralRisk(data);
        break;
      case "payout":
        await evaluatePayoutRisk(data);
        break;
      default:
        logger.warn({ type: (data as any).type }, "Unknown risk evaluation type");
    }
  } catch (error) {
    logger.error({ err: error, jobId: job.id }, "Risk evaluation failed");
    throw error;
  }
}

async function evaluateUserRisk(data: Extract<RiskEvaluationJobData, { type: "user" }>) {
  // Logic to evaluate user risk (signup velocity, IP reuse, etc)
}

async function evaluateMatchRisk(data: Extract<RiskEvaluationJobData, { type: "match" }>) {
  const { matchId } = data;
  
  const [match] = await db
    .select()
    .from(hostedMatchesTable)
    .where(eq(hostedMatchesTable.id, matchId))
    .limit(1);

  if (!match || match.status === "completed" || match.status === "cancelled") {
    return; // DB Recheck
  }

  // Simplified risk logic for demo
  let score = 0;
  
  if (score >= RISK_THRESHOLDS.high) {
    await db.transaction(async (tx) => {
      await tx
        .update(hostedMatchesTable)
        .set({ status: "risk_hold", updatedAt: new Date() })
        .where(eq(hostedMatchesTable.id, matchId));

      await tx.insert(fraudFlagsTable).values({
        entityType: "match",
        entityId: matchId,
        severity: "high",
        reason: "High risk score detected for match",
        score,
      });
      trackRiskMetric("fraud_flag_created", { entityType: "match", matchId });
    });
  } else {
    // Approve
    const now = new Date();
    const SETTLEMENT_HOLD_HOURS = 24;
    const settlementReleasesAt = new Date(now.getTime() + SETTLEMENT_HOLD_HOURS * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await tx
        .update(hostedMatchesTable)
        .set({
          status: "completed",
          settlementReleasesAt,
          updatedAt: now,
        })
        .where(eq(hostedMatchesTable.id, matchId));

      await tx.insert(notificationsTable).values({
        userId: match.hostUserId,
        type: "match_confirmed",
        title: "Match verified!",
        body: `Attendance quorum reached. Payouts will be released in ${SETTLEMENT_HOLD_HOURS} hours.`,
        referenceId: matchId,
      });
    });
  }
}

async function evaluateReferralRisk(data: Extract<RiskEvaluationJobData, { type: "referral" }>) {
  const { referralId } = data; // which is referredUserId right now

  const [referral] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referredUserId, referralId))
    .limit(1);

  if (!referral || referral.status !== "pending_review") {
    return; // DB Recheck
  }

  let score = 0;

  if (score >= RISK_THRESHOLDS.high) {
    await db.transaction(async (tx) => {
      await tx.insert(fraudFlagsTable).values({
        entityType: "referral",
        entityId: referral.id,
        severity: "high",
        reason: "High risk score detected for referral",
        score,
      });
      trackRiskMetric("referral_abuse_detected", { referralId: referral.id });
    });
  } else {
    await db
      .update(referralsTable)
      .set({
        status: "credited",
        creditedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(referralsTable.id, referral.id));
  }
}

async function evaluatePayoutRisk(data: Extract<RiskEvaluationJobData, { type: "payout" }>) {
  const { payoutId } = data;

  const [payout] = await db
    .select()
    .from(venuePayoutLedgerTable)
    .where(eq(venuePayoutLedgerTable.id, payoutId))
    .limit(1);

  if (!payout || payout.status !== "risk_hold") {
    return; // DB Recheck
  }

  let score = 0;

  if (score >= RISK_THRESHOLDS.high) {
    await db.transaction(async (tx) => {
      await tx.insert(fraudFlagsTable).values({
        entityType: "payout",
        entityId: payoutId,
        severity: "high",
        reason: "High risk score detected for payout",
        score,
      });
      trackRiskMetric("payout_hold_triggered", { payoutId });
    });
  } else {
    await db
      .update(venuePayoutLedgerTable)
      .set({
        status: "pending",
      })
      .where(eq(venuePayoutLedgerTable.id, payoutId));
  }
}
