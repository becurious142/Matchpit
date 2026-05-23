import { db, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export type BookingState =
  | "pending" // pre-checkout
  | "payment_pending" // razorpay order created
  | "confirmed" // successful payment
  | "cancel_pending" // user requested cancel
  | "cancelled" // cancelled and refunded
  | "completed" // time has passed and attendance verified
  | "disputed" // user reported an issue
  | "risk_hold" // suspicious activity detected
  | "expired"; // slot time passed without payment

export class InvalidStateTransitionError extends Error {
  constructor(public from: string, public to: string) {
    super(`Invalid booking state transition from ${from} to ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

export class MatchBookingMachine {
  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ["payment_pending", "expired", "cancelled"],
    payment_pending: ["confirmed", "expired", "cancelled", "risk_hold"],
    confirmed: ["completed", "cancel_pending", "cancelled", "disputed"],
    cancel_pending: ["cancelled", "confirmed"], // can be rolled back to confirmed if refund fails
    cancelled: [], // terminal
    completed: ["disputed"],
    disputed: ["completed", "cancelled", "risk_hold"],
    risk_hold: ["confirmed", "cancelled"], // risk cleared or failed
    expired: [], // terminal
  };

  static isValidTransition(current: string, next: string): boolean {
    return this.VALID_TRANSITIONS[current]?.includes(next) ?? false;
  }

  static async transition(bookingId: string, nextState: BookingState, reason?: string, externalTx?: any): Promise<boolean> {
    const executeTransition = async (tx: any) => {
      const [booking] = await tx
        .select({ status: bookingsTable.status })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, bookingId))
        .for("update")
        .limit(1);

      if (!booking) {
        throw new Error("Booking not found");
      }

      const currentStatus = booking.status;
      if (currentStatus === nextState) return true;

      if (!this.isValidTransition(currentStatus, nextState)) {
        logger.warn({ bookingId, currentStatus, nextState }, "Invalid state transition attempted");
        throw new InvalidStateTransitionError(currentStatus, nextState);
      }

      await tx
        .update(bookingsTable)
        .set({ status: nextState, updatedAt: new Date() })
        .where(eq(bookingsTable.id, bookingId));

      logger.info({ bookingId, from: currentStatus, to: nextState, reason }, "Booking state transitioned");
      return true;
    };

    if (externalTx) {
      return await executeTransition(externalTx);
    } else {
      return await db.transaction(executeTransition);
    }
  }
}
