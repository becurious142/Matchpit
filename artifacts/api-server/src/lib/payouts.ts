import { db } from "@workspace/db";
import { venuePayoutLedgerTable, platformRevenueLedgerTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

const PLATFORM_COMMISSION_RATE = 0.12;
const GATEWAY_FEE_RATE = 0.02;

export interface PayoutCalculation {
  grossAmount: number;
  gatewayFee: number;
  platformCommission: number;
  venuePayable: number;
  netRevenue: number;
}

export function calculatePayout(grossAmount: number): PayoutCalculation {
  const gatewayFee = Math.round(grossAmount * GATEWAY_FEE_RATE * 100) / 100;
  const platformCommission = Math.round((grossAmount - gatewayFee) * PLATFORM_COMMISSION_RATE * 100) / 100;
  const venuePayable = Math.round((grossAmount - gatewayFee - platformCommission) * 100) / 100;
  const netRevenue = Math.round((platformCommission - gatewayFee) * 100) / 100;

  return { grossAmount, gatewayFee, platformCommission, venuePayable, netRevenue };
}

export async function generateBookingPayout(
  venueId: string,
  bookingId: string,
  grossAmount: number,
): Promise<void> {
  const calc = calculatePayout(grossAmount);

  try {
    await db.insert(venuePayoutLedgerTable).values({
      venueId,
      referenceId: bookingId,
      referenceType: "booking",
      grossAmount: calc.grossAmount.toString(),
      razorpayFee: calc.gatewayFee.toString(),
      platformCommission: calc.platformCommission.toString(),
      venuePayable: calc.venuePayable.toString(),
      status: "pending",
    });

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
  payoutType?: "host_commitment" | "match_reserve" | "match_final",
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
    await db.insert(venuePayoutLedgerTable).values({
      venueId,
      referenceId: matchId,
      referenceType: "hosted_match",
      grossAmount: calc.grossAmount.toString(),
      razorpayFee: calc.gatewayFee.toString(),
      platformCommission: calc.platformCommission.toString(),
      venuePayable: calc.venuePayable.toString(),
      paymentId: paymentId ?? null,
      payoutType: payoutType ?? null,
      status: "pending",
    });

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
