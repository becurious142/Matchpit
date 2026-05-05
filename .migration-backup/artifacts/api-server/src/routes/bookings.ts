import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  bookingsTable,
  venuesTable,
  slotsTable,
  paymentsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { verifyRazorpaySignature } from "../lib/razorpay";
import { debitWallet, processFirstBookingCashback, processReferralRewards, processCancellationRefund } from "../lib/wallet";
import { generateBookingPayout } from "../lib/payouts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatBooking(
  b: typeof bookingsTable.$inferSelect,
  venue?: typeof venuesTable.$inferSelect | null,
) {
  return {
    id: b.id,
    userId: b.userId,
    venueId: b.venueId,
    slotId: b.slotId,
    sport: b.sport,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    totalAmount: Number(b.totalAmount),
    status: b.status,
    paymentId: b.paymentId ?? null,
    createdAt: b.createdAt.toISOString(),
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          city: venue.city,
          address: venue.address,
          sports: venue.sports ?? [],
          pricePerHour: Number(venue.pricePerHour),
          coverImage: venue.coverImage ?? null,
          rating: Number(venue.rating),
          totalReviews: venue.totalReviews,
          isApproved: venue.isApproved,
          amenities: venue.amenities ?? [],
        }
      : null,
  };
}

router.get("/bookings", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { status } = req.query as { status?: string };
    const conditions = [eq(bookingsTable.userId, profile.id)];

    if (status === "upcoming") {
      conditions.push(eq(bookingsTable.status, "confirmed"));
    } else if (status === "past") {
      conditions.push(eq(bookingsTable.status, "completed"));
    } else if (status === "cancelled") {
      conditions.push(eq(bookingsTable.status, "cancelled"));
    }

    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(and(...conditions))
      .orderBy(desc(bookingsTable.createdAt));

    const venueIds = [...new Set(bookings.map((b) => b.venueId))];
    const venues =
      venueIds.length > 0
        ? await db.select().from(venuesTable).where(inArray(venuesTable.id, venueIds))
        : [];
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    res.json(bookings.map((b) => formatBooking(b, venueMap.get(b.venueId) ?? null)));
  } catch (err) {
    req.log.error({ err }, "Error listing bookings");
    res.status(500).json({ error: "internal_error", message: "Failed to list bookings" });
  }
});

// ─── POST /bookings ───────────────────────────────────────────────────────────
// C3: Idempotency guard on razorpayOrderId + verified slot row-count lock.
// C1: Post-booking commerce (payout, cashback, referral) awaited before response.
router.post("/bookings", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const {
      venueId,
      slotId,
      sport,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      walletAmountUsed = 0,
    } = req.body;

    // C3: Idempotency — if a successful booking already exists for this order, return it
    if (razorpayOrderId) {
      const [existingPayment] = await db
        .select()
        .from(paymentsTable)
        .where(and(
          eq(paymentsTable.razorpayOrderId, razorpayOrderId),
          eq(paymentsTable.status, "success"),
          eq(paymentsTable.userId, profile.id),
        ))
        .limit(1);

      if (existingPayment?.referenceId) {
        const [existingBooking] = await db
          .select()
          .from(bookingsTable)
          .where(eq(bookingsTable.id, existingPayment.referenceId))
          .limit(1);
        if (existingBooking) {
          const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, existingBooking.venueId)).limit(1);
          res.status(200).json(formatBooking(existingBooking, venue ?? null));
          return;
        }
      }
    }

    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid && process.env.RAZORPAY_KEY_SECRET && walletAmountUsed === 0) {
      res.status(400).json({ error: "invalid_signature", message: "Payment signature invalid" });
      return;
    }

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    const walletUsed = Math.min(Number(walletAmountUsed), Number(profile.walletBalance));

    const result = await db.transaction(async (tx) => {
      const [slot] = await tx
        .select()
        .from(slotsTable)
        .where(eq(slotsTable.id, slotId))
        .limit(1);

      if (!slot) return { error: "not_found" as const };
      if (slot.status !== "available") return { error: "slot_unavailable" as const };

      const totalAmount = Number(slot.priceOverride ?? venue.pricePerHour);

      if (walletUsed > 0) {
        const txDb = tx as unknown as typeof db;
        await debitWallet(txDb, profile.id, walletUsed, "Wallet used for booking payment", slotId);
      }

      // C3: Conditional update with row-count verification — prevents double-booking
      const updateResult = await tx.execute(
        sql`UPDATE ${slotsTable}
            SET status = 'booked', updated_at = NOW()
            WHERE id = ${slotId} AND status = 'available'`,
      );

      // Drizzle returns rowCount on execute for Neon/pg drivers
      const rowsAffected = (updateResult as unknown as { rowCount?: number }).rowCount ?? 1;
      if (rowsAffected === 0) {
        return { error: "slot_unavailable" as const };
      }

      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          userId: profile.id,
          type: "booking",
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amount: totalAmount.toString(),
          status: "success",
        })
        .returning();

      const [booking] = await tx
        .insert(bookingsTable)
        .values({
          userId: profile.id,
          venueId,
          slotId,
          sport,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          totalAmount: totalAmount.toString(),
          status: "confirmed",
          paymentId: payment.id,
          razorpayOrderId,
          razorpayPaymentId,
        })
        .returning();

      await tx
        .update(paymentsTable)
        .set({ referenceId: booking.id })
        .where(eq(paymentsTable.id, payment.id));

      return { booking, venue, slot };
    });

    if ("error" in result) {
      if (result.error === "not_found") {
        res.status(404).json({ error: "not_found", message: "Slot not found" });
      } else {
        res.status(409).json({ error: "slot_unavailable", message: "Slot is no longer available" });
      }
      return;
    }

    const { booking, slot } = result;

    // Notification — non-critical, log on failure
    try {
      await db.insert(notificationsTable).values({
        userId: profile.id,
        type: "payment_success",
        title: "Booking Confirmed!",
        body: `Your booking at ${venue.name} on ${slot.date} (${slot.startTime} - ${slot.endTime}) is confirmed.`,
        referenceId: booking.id,
      });
    } catch (e) {
      logger.warn({ err: e }, "Booking confirmation notification failed");
    }

    // C1: Post-booking commerce — awaited before response, no setImmediate
    await generateBookingPayout(venue.id, booking.id, Number(booking.totalAmount));
    await processFirstBookingCashback(profile.id, booking.id);
    await processReferralRewards(profile.id);

    res.status(201).json(formatBooking(booking, venue));
  } catch (err) {
    req.log.error({ err }, "Error creating booking");
    res.status(500).json({ error: "internal_error", message: "Failed to create booking" });
  }
});

router.get("/bookings/:bookingId", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const bookingId = req.params.bookingId as string;
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.userId, profile.id)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "not_found", message: "Booking not found" });
      return;
    }

    const [venue] = await db
      .select()
      .from(venuesTable)
      .where(eq(venuesTable.id, booking.venueId))
      .limit(1);

    res.json(formatBooking(booking, venue ?? null));
  } catch (err) {
    req.log.error({ err }, "Error fetching booking");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch booking" });
  }
});

// ─── POST /bookings/:bookingId/cancel ─────────────────────────────────────────
// C1: Cancellation refund is awaited before response — no setImmediate.
router.post("/bookings/:bookingId/cancel", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const bookingId = req.params.bookingId as string;
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.userId, profile.id)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "not_found", message: "Booking not found" });
      return;
    }

    if (booking.status === "cancelled") {
      res.status(400).json({ error: "already_cancelled", message: "Booking already cancelled" });
      return;
    }

    await db
      .update(slotsTable)
      .set({ status: "available", updatedAt: new Date() })
      .where(eq(slotsTable.id, booking.slotId));

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    // C1: Cancellation refund awaited before response — no setImmediate
    const refund = Math.floor(Number(booking.totalAmount) * 0.5);
    if (refund > 0) {
      try {
        await processCancellationRefund(profile.id, bookingId, "booking", refund);
      } catch (e) {
        logger.error({ err: e, bookingId }, "Cancellation refund failed — manual review required");
      }
    }

    res.json(formatBooking(updated, null));
  } catch (err) {
    req.log.error({ err }, "Error cancelling booking");
    res.status(500).json({ error: "internal_error", message: "Failed to cancel booking" });
  }
});

export default router;
