import { db } from "@workspace/db";
import { venuePayoutLedgerTable, platformRevenueLedgerTable } from "@workspace/db";
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
): Promise<void> {
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
      status: "pending",
    });

    await db.insert(platformRevenueLedgerTable).values({
      referenceId: matchId,
      referenceType: "hosted_match",
      grossAmount: calc.grossAmount.toString(),
      gatewayFee: calc.gatewayFee.toString(),
      commissionAmount: calc.platformCommission.toString(),
      netRevenue: calc.netRevenue.toString(),
      notes: `Hosted match ${matchId}`,
    });

    logger.info({ matchId, venueId, ...calc }, "Match payout generated");
  } catch (err) {
    logger.error({ err, matchId, venueId }, "Failed to generate match payout");
  }
}
