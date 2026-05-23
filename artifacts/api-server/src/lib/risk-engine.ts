import { riskEvaluationsQueue } from "../queues/queues";
import { logger } from "./logger";

export type RiskEvaluationJobData =
  | { type: "user"; userId: string; eventType: string; ipAddress?: string; userAgent?: string }
  | { type: "match"; matchId: string }
  | { type: "referral"; referralId: string; ipAddress?: string; userAgent?: string }
  | { type: "payout"; payoutId: string; venueId: string };

export async function enqueueRiskEvaluation(data: RiskEvaluationJobData): Promise<void> {
  const jobId = `${data.type}_${"matchId" in data ? data.matchId : "userId" in data ? data.userId : "referralId" in data ? data.referralId : data.payoutId}_${Date.now()}`;
  
  await riskEvaluationsQueue().add("evaluate-risk", data, {
    jobId,
  });

  logger.info({ ...data, jobId }, "Risk evaluation enqueued");
}
