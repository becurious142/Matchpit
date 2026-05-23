import client from "prom-client";

// Global Registry
export const registry = new client.Registry();

// Default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register: registry });

// Custom Matchpit Metrics

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  buckets: [10, 50, 100, 300, 500, 1000, 3000, 5000],
  registers: [registry],
});

export const activeBookingsGauge = new client.Gauge({
  name: "matchpit_active_bookings",
  help: "Number of active (confirmed) bookings",
  registers: [registry],
});

export const workerJobsProcessedTotal = new client.Counter({
  name: "worker_jobs_processed_total",
  help: "Total number of background worker jobs processed",
  labelNames: ["queue_name", "status"], // success, failed
  registers: [registry],
});

export const paymentProcessingTimeMs = new client.Histogram({
  name: "payment_processing_duration_ms",
  help: "Time spent verifying and processing payments",
  labelNames: ["type", "status"],
  buckets: [50, 100, 500, 1000, 5000],
  registers: [registry],
});

// Phase 14 Business SLOs
export const bookingConversionRateGauge = new client.Gauge({
  name: "business_booking_conversion_rate",
  help: "Percentage of checkouts that result in successful booking",
  registers: [registry],
});

export const payoutFreezeCountGauge = new client.Gauge({
  name: "business_payout_freeze_count",
  help: "Number of active payout freezes",
  registers: [registry],
});

export const fraudHoldRateGauge = new client.Gauge({
  name: "business_fraud_hold_rate",
  help: "Percentage of transactions placed on fraud hold",
  registers: [registry],
});

export const reconciliationMismatchCountGauge = new client.Gauge({
  name: "business_reconciliation_mismatch_count",
  help: "Number of unresolved reconciliation anomalies",
  registers: [registry],
});

export const workerStallDurationMs = new client.Histogram({
  name: "worker_stall_duration_ms",
  help: "Time a worker remains stalled/blocked between jobs",
  labelNames: ["queue_name"],
  buckets: [10, 50, 100, 500, 1000, 5000],
  registers: [registry],
});

export const sseFlushLatencyMs = new client.Histogram({
  name: "sse_flush_latency_ms",
  help: "Latency of flushing an SSE message to the client socket",
  buckets: [1, 5, 10, 50, 100, 500],
  registers: [registry],
});

/**
 * Returns Prometheus-compatible text format
 */
export async function getMetrics() {
  return await registry.metrics();
}
