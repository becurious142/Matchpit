import { logger } from "./logger";

type RiskMetricEvent =
  | "fraud_flag_created"
  | "false_positive_resolution"
  | "payout_hold_triggered"
  | "referral_abuse_detected"
  | "match_disputed_by_risk_engine";

export function trackRiskMetric(
  metric: RiskMetricEvent,
  metadata: Record<string, any> = {},
) {
  // In a production system, this could forward to Prometheus/Datadog or similar.
  // For now, we utilize structured logging to aggregate metrics.
  logger.info(
    {
      metric_type: "risk_engine",
      event: metric,
      ...metadata,
    },
    `Risk Metric: ${metric}`
  );
}
