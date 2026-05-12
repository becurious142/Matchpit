/**
 * HM11B — Operational Monitoring Endpoints
 *
 * GET /admin/monitoring/health
 *   Returns live health snapshot across all critical operational dimensions.
 *   Includes embedded alert list when thresholds are breached.
 *
 * GET /admin/monitoring/metrics
 *   Returns time-series payment/settlement/refund metrics for the last 7 days.
 *
 * Both endpoints require admin authentication (requireAuth + requireAdmin).
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  hostedMatchesTable,
  hostedMatchReservationsTable,
  venuePayoutLedgerTable,
  paymentWebhookEventsTable,
  reconciliationReportsTable,
  platformRevenueLedgerTable,
} from "@workspace/db";
import { eq, and, lt, gt, count, sum, inArray, ne, sql } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";

const router: IRouter = Router();

// ─── Auth Guard ────────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any) {
  const { userId } = getAuth(req);
  const profile = await getProfileByClerkId(userId!);
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Admin access required" });
    return null;
  }
  return profile;
}

// ─── Alert Threshold Constants ─────────────────────────────────────────────────
const ALERT_THRESHOLDS = {
  refundRequired: 0,          // Any refund_required → CRITICAL
  webhookFailuresPerHour: 5,  // >5 webhook failures/hr → WARNING
  reconciliationAnomalies: 0, // Any unresolved → HIGH
  pendingCaptured: 10,        // >10 captured awaiting conversion → WARNING
  stuckMatches: 0,            // Any stuck >24h → WARNING
  processingBatchHours: 24,   // Batch processing >24h → HIGH
} as const;

// ─── GET /admin/monitoring/health ─────────────────────────────────────────────
router.get("/admin/monitoring/health", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      pendingPayments,
      capturedAwaitingConversion,
      refundRequiredPayments,
      pendingPayouts,
      processingBatches,
      failedWebhooks,
      reconciliationAnomalies,
      stuckConfirmed,
      stuckFullyPaid,
    ] = await Promise.all([
      // Payments still in pending/payment_initiated > 30 min
      db.select({ count: count() })
        .from(paymentsTable)
        .where(
          and(
            inArray(paymentsTable.status, ["pending", "payment_initiated"]),
            lt(paymentsTable.createdAt, new Date(now.getTime() - 30 * 60 * 1000))
          )
        ),

      // payment_captured status awaiting conversion
      db.select({ count: count() })
        .from(paymentsTable)
        .where(eq(paymentsTable.status, "payment_captured")),

      // refund_required review queue
      db.select({ count: count() })
        .from(paymentsTable)
        .where(eq(paymentsTable.reviewStatus, "refund_required")),

      // pending payout rows
      db.select({ count: count() })
        .from(venuePayoutLedgerTable)
        .where(inArray(venuePayoutLedgerTable.status, ["pending", "ready_for_settlement"])),

      // settlement batches stuck in processing > 24h
      db.select({ count: count() })
        .from(venuePayoutLedgerTable)
        .where(
          and(
            eq(venuePayoutLedgerTable.status, "processing"),
            lt(venuePayoutLedgerTable.createdAt, twentyFourHoursAgo)
          )
        ),

      // webhook failures in the last hour
      db.select({ count: count() })
        .from(paymentWebhookEventsTable)
        .where(
          and(
            inArray(paymentWebhookEventsTable.processingStatus, ["failed", "refund_required"]),
            gt(paymentWebhookEventsTable.createdAt, oneHourAgo)
          )
        ),

      // unresolved reconciliation anomalies
      db.select({ count: count() })
        .from(reconciliationReportsTable)
        .where(eq(reconciliationReportsTable.resolved, false)),

      // matches stuck in confirmed > 24h
      db.select({ count: count() })
        .from(hostedMatchesTable)
        .where(
          and(
            eq(hostedMatchesTable.status, "confirmed"),
            lt(hostedMatchesTable.updatedAt, twentyFourHoursAgo)
          )
        ),

      // matches stuck in fully_paid > 24h
      db.select({ count: count() })
        .from(hostedMatchesTable)
        .where(
          and(
            eq(hostedMatchesTable.status, "fully_paid"),
            lt(hostedMatchesTable.updatedAt, twentyFourHoursAgo)
          )
        ),
    ]);

    const metrics = {
      pendingPayments: Number(pendingPayments[0]?.count ?? 0),
      capturedAwaitingConversion: Number(capturedAwaitingConversion[0]?.count ?? 0),
      refundRequiredPayments: Number(refundRequiredPayments[0]?.count ?? 0),
      pendingPayouts: Number(pendingPayouts[0]?.count ?? 0),
      processingSettlementBatches: Number(processingBatches[0]?.count ?? 0),
      failedWebhooksLastHour: Number(failedWebhooks[0]?.count ?? 0),
      reconciliationAnomalies: Number(reconciliationAnomalies[0]?.count ?? 0),
      matchesStuckConfirmed24h: Number(stuckConfirmed[0]?.count ?? 0),
      matchesStuckFullyPaid24h: Number(stuckFullyPaid[0]?.count ?? 0),
    };

    // ─── Alert Generation ────────────────────────────────────────────────────
    const alerts: Array<{ severity: string; code: string; message: string; value: number }> = [];

    if (metrics.refundRequiredPayments > ALERT_THRESHOLDS.refundRequired) {
      alerts.push({
        severity: "CRITICAL",
        code: "REFUND_REQUIRED",
        message: `${metrics.refundRequiredPayments} payment(s) require manual refund`,
        value: metrics.refundRequiredPayments,
      });
    }

    if (metrics.reconciliationAnomalies > ALERT_THRESHOLDS.reconciliationAnomalies) {
      alerts.push({
        severity: "HIGH",
        code: "RECONCILIATION_ANOMALIES",
        message: `${metrics.reconciliationAnomalies} unresolved reconciliation anomalie(s)`,
        value: metrics.reconciliationAnomalies,
      });
    }

    if (metrics.processingSettlementBatches > 0) {
      alerts.push({
        severity: "HIGH",
        code: "STUCK_SETTLEMENT_BATCHES",
        message: `${metrics.processingSettlementBatches} settlement batch(es) stuck in processing > 24h`,
        value: metrics.processingSettlementBatches,
      });
    }

    if (metrics.failedWebhooksLastHour > ALERT_THRESHOLDS.webhookFailuresPerHour) {
      alerts.push({
        severity: "WARNING",
        code: "WEBHOOK_FAILURES",
        message: `${metrics.failedWebhooksLastHour} webhook failures in the last hour (threshold: ${ALERT_THRESHOLDS.webhookFailuresPerHour})`,
        value: metrics.failedWebhooksLastHour,
      });
    }

    if (metrics.capturedAwaitingConversion > ALERT_THRESHOLDS.pendingCaptured) {
      alerts.push({
        severity: "WARNING",
        code: "PENDING_CAPTURED",
        message: `${metrics.capturedAwaitingConversion} captured payments awaiting conversion (threshold: ${ALERT_THRESHOLDS.pendingCaptured})`,
        value: metrics.capturedAwaitingConversion,
      });
    }

    const stuckTotal = metrics.matchesStuckConfirmed24h + metrics.matchesStuckFullyPaid24h;
    if (stuckTotal > ALERT_THRESHOLDS.stuckMatches) {
      alerts.push({
        severity: "WARNING",
        code: "STUCK_MATCHES",
        message: `${stuckTotal} match(es) stuck in intermediate state > 24h`,
        value: stuckTotal,
      });
    }

    res.json({
      asOf: now.toISOString(),
      status: alerts.some((a) => a.severity === "CRITICAL")
        ? "CRITICAL"
        : alerts.some((a) => a.severity === "HIGH")
        ? "DEGRADED"
        : alerts.length > 0
        ? "WARNING"
        : "HEALTHY",
      ...metrics,
      stuckMatchesTotal: stuckTotal,
      alerts,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching monitoring health");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch health data" });
  }
});

// ─── GET /admin/monitoring/metrics ────────────────────────────────────────────
router.get("/admin/monitoring/metrics", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const daysBack = Math.min(30, Math.max(1, parseInt((req.query.days as string) ?? "7")));
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    since.setHours(0, 0, 0, 0);

    // Build per-day stats using raw SQL for date truncation
    const paymentsByDay = await db.execute(sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE status IN ('pending', 'payment_initiated', 'verified', 'success', 'payment_captured')) AS payments_created,
        COUNT(*) FILTER (WHERE status IN ('verified', 'success', 'payment_captured')) AS payments_captured,
        COUNT(*) FILTER (WHERE type = 'refund') AS refunds_issued,
        SUM(CASE WHEN status IN ('verified','success','payment_captured') THEN gross_amount ELSE 0 END) AS gross_collected
      FROM payments
      WHERE created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const webhooksByDay = await db.execute(sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE processing_status IN ('failed','refund_required')) AS webhook_failures
      FROM payment_webhook_events
      WHERE created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const reservationsByDay = await db.execute(sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE reservation_status = 'expired') AS reservation_expiries
      FROM hosted_match_reservations
      WHERE created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const settlementsByDay = await db.execute(sql`
      SELECT
        DATE(paid_at) AS day,
        SUM(venue_payable) AS settlement_total,
        SUM(platform_commission) AS revenue_total
      FROM venue_payout_ledger
      WHERE paid_at >= ${since} AND status = 'paid'
      GROUP BY DATE(paid_at)
      ORDER BY day ASC
    `);

    // Merge into a single time-series array
    const days: Map<string, any> = new Map();

    for (const row of (paymentsByDay as any).rows ?? paymentsByDay) {
      const d = String(row.day).slice(0, 10);
      days.set(d, {
        date: d,
        paymentsCreated: Number(row.payments_created ?? 0),
        paymentsCaptured: Number(row.payments_captured ?? 0),
        refundsIssued: Number(row.refunds_issued ?? 0),
        grossCollected: Number(row.gross_collected ?? 0),
        webhookFailures: 0,
        reservationExpiries: 0,
        settlementTotal: 0,
        revenueTotal: 0,
      });
    }

    for (const row of (webhooksByDay as any).rows ?? webhooksByDay) {
      const d = String(row.day).slice(0, 10);
      const existing = days.get(d) ?? { date: d, paymentsCreated: 0, paymentsCaptured: 0, refundsIssued: 0, grossCollected: 0, webhookFailures: 0, reservationExpiries: 0, settlementTotal: 0, revenueTotal: 0 };
      existing.webhookFailures = Number(row.webhook_failures ?? 0);
      days.set(d, existing);
    }

    for (const row of (reservationsByDay as any).rows ?? reservationsByDay) {
      const d = String(row.day).slice(0, 10);
      const existing = days.get(d) ?? { date: d, paymentsCreated: 0, paymentsCaptured: 0, refundsIssued: 0, grossCollected: 0, webhookFailures: 0, reservationExpiries: 0, settlementTotal: 0, revenueTotal: 0 };
      existing.reservationExpiries = Number(row.reservation_expiries ?? 0);
      days.set(d, existing);
    }

    for (const row of (settlementsByDay as any).rows ?? settlementsByDay) {
      const d = String(row.day).slice(0, 10);
      const existing = days.get(d) ?? { date: d, paymentsCreated: 0, paymentsCaptured: 0, refundsIssued: 0, grossCollected: 0, webhookFailures: 0, reservationExpiries: 0, settlementTotal: 0, revenueTotal: 0 };
      existing.settlementTotal = Number(row.settlement_total ?? 0);
      existing.revenueTotal = Number(row.revenue_total ?? 0);
      days.set(d, existing);
    }

    const series = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate totals
    const totals = series.reduce((acc, d) => ({
      paymentsCreated: acc.paymentsCreated + d.paymentsCreated,
      paymentsCaptured: acc.paymentsCaptured + d.paymentsCaptured,
      refundsIssued: acc.refundsIssued + d.refundsIssued,
      grossCollected: acc.grossCollected + d.grossCollected,
      webhookFailures: acc.webhookFailures + d.webhookFailures,
      reservationExpiries: acc.reservationExpiries + d.reservationExpiries,
      settlementTotal: acc.settlementTotal + d.settlementTotal,
      revenueTotal: acc.revenueTotal + d.revenueTotal,
    }), {
      paymentsCreated: 0, paymentsCaptured: 0, refundsIssued: 0, grossCollected: 0,
      webhookFailures: 0, reservationExpiries: 0, settlementTotal: 0, revenueTotal: 0,
    });

    res.json({
      periodDays: daysBack,
      since: since.toISOString(),
      asOf: new Date().toISOString(),
      daily: series,
      totals,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching monitoring metrics");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch metrics" });
  }
});

export default router;
