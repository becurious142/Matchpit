import { db } from "@workspace/db";
import { venuePayoutLedgerTable, platformRevenueLedgerTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import {
  calculatePayoutBreakdown,
  calculateGatewayFee,
  calculatePlatformCommission,
  PLATFORM_COMMISSION_PERCENT,
  GATEWAY_FEE_PERCENT,
} from "./financial-config";
import { enqueueRiskEvaluation } from "./risk-engine";

export interface PayoutCalculation {
  grossAmount: number;
  gatewayFee: number;
  platformCommission: number;
  venuePayable: number;
  netRevenue: number;
}

/**
 * Calculate payout breakdown for a gross payment amount.
 *
 * DOUBLE-ENTRY ACCOUNTING:
 * 1. Gateway fee deducted FIRST (Razorpay keeps this)
 * 2. Platform commission calculated on NET (after gateway)
 * 3. Venue receives remainder
 * 4. Platform net revenue = commission (gateway already gone)
 *
 * CRITICAL BUG FIX (Phase 2A):
 * Old formula: netRevenue = platformCommission - gatewayFee ❌
 * New formula: netRevenue = platformCommission ✅
 *
 * Why the old formula was wrong:
 * - Gateway fee already subtracted when calculating venuePayable
 * - Subtracting it again double-counts the deduction
 * - This understated platform revenue by 2% of gross in all reports
 *
 * Example:
 * Gross: ₹1,000
 * Gateway (2%): -₹20 → Razorpay keeps
 * Net: ₹980
 * Commission (15% of ₹980): ₹147 → Platform keeps
 * Venue: ₹980 - ₹147 = ₹833
 * Platform net revenue: ₹147 (NOT ₹147 - ₹20 = ₹127)
 *
 * @param grossAmount - Total payment amount before fees
 * @returns Payout breakdown
 */
export function calculatePayout(grossAmount: number): PayoutCalculation {
  // Use centralized calculation from financial-config
  return calculatePayoutBreakdown(grossAmount);
}

export async function generateBookingPayout(
  venueId: string,
  bookingId: string,
  grossAmount: number,
): Promise<void> {
  const calc = calculatePayout(grossAmount);

  try {
    const payoutId = await db.insert(venuePayoutLedgerTable).values({
      venueId,
      referenceId: bookingId,
      referenceType: "booking",
      grossAmount: calc.grossAmount.toString(),
      razorpayFee: calc.gatewayFee.toString(),
      platformCommission: calc.platformCommission.toString(),
      venuePayable: calc.venuePayable.toString(),
      status: "risk_hold", // Phase 9: Start with risk_hold instead of pending
    }).returning({ id: venuePayoutLedgerTable.id });

    // Phase 9: Enqueue risk evaluation
    if (payoutId.length > 0) {
      await enqueueRiskEvaluation({
        type: "payout",
        payoutId: payoutId[0].id,
        venueId,
      });
    }

    await db.insert(platformRevenueLedgerTable).values({
      referenceId: bookingId,
      referenceType: "booking",
      grossAmount: calc.grossAmount.toString(),
      gatewayFee: calc.gatewayFee.toString(),
      commissionAmount: calc.platformCommission.toString(),
      netRevenue: calc.netRevenue.toString(),
      notes: `Booking ${bookingId}`,
    });

    logger.info({ bookingId, venueId, ...calc }, "Booking payout generated");
  } catch (err) {
    logger.error({ err, bookingId, venueId }, "Failed to generate booking payout");
  }
}

export async function generateMatchPayout(
  venueId: string,
  matchId: string,
  grossAmount: number,
  paymentId?: string,
  payoutType?: "host_commitment" | "match_reserve" | "match_final" | "match_join" | "reversal",
): Promise<void> {
  // HM8 FORENSIC PATCH — Idempotency guard: skip if payout row already exists for this paymentId + payoutType
  // Protects against: verify retries, duplicate webhook delivery, manual re-trigger
  if (paymentId && payoutType) {
    const [existing] = await db
      .select({ id: venuePayoutLedgerTable.id })
      .from(venuePayoutLedgerTable)
      .where(
        and(
          eq(venuePayoutLedgerTable.paymentId, paymentId),
          eq(venuePayoutLedgerTable.payoutType, payoutType),
        ),
      )
      .limit(1);
    if (existing) {
      logger.info({ matchId, paymentId, payoutType }, "Payout already exists — skipping (idempotent)");
      return;
    }
  }

  const calc = calculatePayout(grossAmount);

  try {
    const payoutId = await db.insert(venuePayoutLedgerTable).values({
      venueId,
      referenceId: matchId,
      referenceType: "hosted_match",
      grossAmount: calc.grossAmount.toString(),
      razorpayFee: calc.gatewayFee.toString(),
      platformCommission: calc.platformCommission.toString(),
      venuePayable: calc.venuePayable.toString(),
      paymentId: paymentId ?? null,
      payoutType: payoutType ?? null,
      status: "risk_hold", // Phase 9: Start with risk_hold instead of pending
    }).returning({ id: venuePayoutLedgerTable.id });

    // Phase 9: Enqueue risk evaluation
    if (payoutId.length > 0) {
      await enqueueRiskEvaluation({
        type: "payout",
        payoutId: payoutId[0].id,
        venueId,
      });
    }

    await db.insert(platformRevenueLedgerTable).values({
      referenceId: matchId,
      referenceType: "hosted_match",
      grossAmount: calc.grossAmount.toString(),
      gatewayFee: calc.gatewayFee.toString(),
      commissionAmount: calc.platformCommission.toString(),
      netRevenue: calc.netRevenue.toString(),
      paymentId: paymentId ?? null,
      revenueType: payoutType ?? null,
      notes: `Hosted match ${matchId}`,
    });

    logger.info({ matchId, venueId, paymentId, payoutType, ...calc }, "Match payout generated");
  } catch (err) {
    logger.error({ err, matchId, venueId }, "Failed to generate match payout");
  }
}

type AnyDb = typeof db;

export async function reverseMatchPayouts(matchId: string, txDb?: AnyDb): Promise<void> {
  // HM10 PATCH 5: Atomicity via transaction injection
  const execute = async (dbInstance: AnyDb) => {
    const venuePayouts = await dbInstance
      .select()
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.referenceId, matchId));

    for (const payout of venuePayouts) {
      // Prevent reversing already reversed or zeroed payouts implicitly by checking notes
      if (payout.notes && payout.notes.includes("REVERSAL")) continue;

      // HM10: Idempotency check - skip if reversal already exists for this payout
      const reversalNotesPattern = `REVERSAL of payout ${payout.id}`;
      const [existingReversal] = await dbInstance
        .select({ id: venuePayoutLedgerTable.id })
        .from(venuePayoutLedgerTable)
        .where(
          and(
            eq(venuePayoutLedgerTable.referenceId, matchId),
            eq(venuePayoutLedgerTable.payoutType, "reversal"),
            eq(venuePayoutLedgerTable.notes, reversalNotesPattern)
          )
        )
        .limit(1);
      if (existingReversal) continue;

      await dbInstance.insert(venuePayoutLedgerTable).values({
        venueId: payout.venueId,
        referenceId: matchId,
        referenceType: payout.referenceType,
        grossAmount: (-Number(payout.grossAmount)).toString(),
        razorpayFee: (-Number(payout.razorpayFee)).toString(),
        platformCommission: (-Number(payout.platformCommission)).toString(),
        venuePayable: (-Number(payout.venuePayable)).toString(),
        status: "hold",
        payoutType: "reversal",
        notes: `REVERSAL of payout ${payout.id}`,
      });
    }

    const platformRevenues = await dbInstance
      .select()
      .from(platformRevenueLedgerTable)
      .where(eq(platformRevenueLedgerTable.referenceId, matchId));

    for (const rev of platformRevenues) {
      if (rev.notes && rev.notes.includes("REVERSAL")) continue;

      await dbInstance.insert(platformRevenueLedgerTable).values({
        referenceId: matchId,
        referenceType: rev.referenceType,
        grossAmount: (-Number(rev.grossAmount)).toString(),
        gatewayFee: (-Number(rev.gatewayFee)).toString(),
        commissionAmount: (-Number(rev.commissionAmount)).toString(),
        netRevenue: (-Number(rev.netRevenue)).toString(),
        revenueType: "reversal",
        notes: `REVERSAL of revenue ${rev.id}`,
      });
    }
  };

  if (txDb) {
    await execute(txDb);
  } else {
    try {
      await db.transaction(async (tx) => {
        await execute(tx as unknown as AnyDb);
      });
    } catch (e) {
      logger.error({ err: e, matchId }, "Failed to execute payout reversal");
      throw e;
    }
  }
}
