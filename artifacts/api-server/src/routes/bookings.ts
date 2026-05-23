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
import { eq, and, desc, inArray, sql, gte, lte } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { verifyRazorpaySignature } from "../lib/razorpay";
import { debitWallet, processFirstBookingCashback, processReferralRewards } from "../lib/wallet";
import { processCancellationRefund } from "../lib/refund-routing";
import { generateBookingPayout } from "../lib/payouts";
import { logger } from "../lib/logger";
import { idempotencyMiddleware } from "../lib/idempotency";
import { DistributedLockService, LockAcquisitionError } from "../lib/locking/distributed-lock";
import { MatchBookingMachine } from "../lib/state-machines/match-booking-machine";

const router: IRouter = Router();

// ─── Shared helpers ────────────────────────────────────────────────────────────

function computeVenueSlotPrice(
  venue: typeof venuesTable.$inferSelect,
  slot: typeof slotsTable.$inferSelect,
): number {
  if (slot.priceOverride != null) return Number(slot.priceOverride);
  const date = new Date(slot.date);
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) return venue.weekendPrice;
  const hour = parseInt(slot.startTime.split(":")[0]!, 10);
  if (hour < 10) return venue.weekdayMorningPrice;
  if (hour < 17) return venue.weekdayDayPrice;
  return venue.weekdayEveningPrice;
}

function validateConsecutiveSlots(slots: typeof slotsTable.$inferSelect[]): boolean {
  if (slots.length === 0) return false;
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.date !== sorted[i + 1]!.date) return false;
    if (sorted[i]!.endTime !== sorted[i + 1]!.startTime) return false;
  }
  return true;
}

// ─── Format helpers ────────────────────────────────────────────────────────────

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
    durationHours: b.durationHours ?? null,
    slotCount: b.slotCount ?? null,
    memberPrice: b.memberPrice ?? null,
    walletCreditEarned: b.walletCreditEarned ?? 0,
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

// ─── GET /bookings ─────────────────────────────────────────────────────────────
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
// Accepts slotIds[] for multi-slot bookings. All slots must be consecutive,
// available, and not owner-blocked. Total is computed server-side.
router.post("/bookings", requireAuth, idempotencyMiddleware(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const {
      venueId,
      slotIds,
      sport,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      walletAmountUsed = 0,
    } = req.body;

    if (!Array.isArray(slotIds) || slotIds.length === 0) {
      res.status(400).json({ error: "validation", message: "slotIds must be a non-empty array" });
      return;
    }

    // ── Idempotency: if a successful booking already exists for this order ──
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

    // ── Fetch venue + all slots ─────────────────────────────────────────────
    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId)).limit(1);
    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    const slots = await db.select().from(slotsTable).where(inArray(slotsTable.id, slotIds as string[]));

    if (slots.length !== (slotIds as string[]).length) {
      res.status(404).json({ error: "not_found", message: "One or more slots not found" });
      return;
    }

    // All slots must belong to this venue
    if (slots.some((s) => s.venueId !== venueId)) {
      res.status(400).json({ error: "validation", message: "All slots must belong to the specified venue" });
      return;
    }

    // All slots must be available and not owner-blocked
    const blockedOrUnavailable = slots.filter((s) => s.isBlockedByOwner || s.status !== "available");
    if (blockedOrUnavailable.length > 0) {
      res.status(409).json({ error: "slot_unavailable", message: "One or more slots are not available" });
      return;
    }

    // Slots must be consecutive
    if (!validateConsecutiveSlots(slots)) {
      res.status(400).json({ error: "validation", message: "Slots must be consecutive and on the same day" });
      return;
    }

    // Sort slots by startTime for deterministic first/last
    const sortedSlots = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const firstSlot = sortedSlots[0]!;
    const lastSlot = sortedSlots[sortedSlots.length - 1]!;

    // ── Server-side total computation ───────────────────────────────────────
    const totalAmount = slots.reduce((sum, s) => sum + computeVenueSlotPrice(venue, s), 0);
    const walletUsed = Math.min(Number(walletAmountUsed), Number(profile.walletBalance));
    const walletCreditEarned = Math.floor(totalAmount * 0.03);

    // ── Atomic transaction ──────────────────────────────────────────────────
    try {
      await DistributedLockService.withLock(`booking:${venueId}:${profile.id}`, async () => {
        const result = await db.transaction(async (tx) => {
      if (walletUsed > 0) {
        const txDb = tx as unknown as typeof db;
        await debitWallet(txDb, profile.id, walletUsed, "Wallet used for booking payment", firstSlot.id);
      }

      // Conditionally update ALL selected slots available -> booked
      const updateResult = await tx.execute(
        sql`UPDATE ${slotsTable}
            SET status = 'booked', updated_at = NOW()
            WHERE id = ANY(ARRAY[${sql.raw((slotIds as string[]).map((id) => `'${id}'`).join(","))}]::uuid[])
            AND status = 'available'`,
      );

      const rowsAffected = (updateResult as unknown as { rowCount?: number }).rowCount ?? 0;
      if (rowsAffected !== (slotIds as string[]).length) {
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
          slotId: firstSlot.id,
          sport,
          date: firstSlot.date,
          startTime: firstSlot.startTime,
          endTime: lastSlot.endTime,
          totalAmount: totalAmount.toString(),
          status: "confirmed",
          paymentId: payment.id,
          razorpayOrderId,
          razorpayPaymentId,
          durationHours: sortedSlots.length,
          slotCount: sortedSlots.length,
          memberPrice: totalAmount,
          walletCreditEarned,
        })
        .returning();

      await tx
        .update(paymentsTable)
        .set({ referenceId: booking.id })
        .where(eq(paymentsTable.id, payment.id));

      return { booking, venue, firstSlot, lastSlot };
    });

    if ("error" in result) {
      res.status(409).json({ error: "slot_unavailable", message: "One or more slots are no longer available" });
      return;
    }

    const { booking, firstSlot: slot } = result;

    // Notification — non-critical
    try {
      await db.insert(notificationsTable).values({
        userId: profile.id,
        type: "payment_success",
        title: "Booking Confirmed!",
        body: `Your booking at ${venue.name} on ${slot.date} (${firstSlot.startTime} - ${lastSlot.endTime}) is confirmed.`,
        referenceId: booking.id,
      });
    } catch (e) {
      logger.warn({ err: e }, "Booking confirmation notification failed");
    }

    // Post-booking commerce — awaited before response
    await generateBookingPayout(venue.id, booking.id, Number(booking.totalAmount));
    await processFirstBookingCashback(profile.id, booking.id);
    await processReferralRewards(profile.id);

        res.status(201).json(formatBooking(booking, venue));
      });
    } catch (err: any) {
      if (err instanceof LockAcquisitionError) {
        res.status(409).json({ error: "conflict", message: "Booking already in progress." });
        return;
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Error creating booking");
    res.status(500).json({ error: "internal_error", message: "Failed to create booking" });
  }
});

// ─── GET /bookings/:bookingId ──────────────────────────────────────────────────
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

    const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, booking.venueId)).limit(1);
    res.json(formatBooking(booking, venue ?? null));
  } catch (err) {
    req.log.error({ err }, "Error fetching booking");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch booking" });
  }
});

// ─── POST /bookings/:bookingId/cancel ─────────────────────────────────────────
// Restores ALL slots covered by the booking time range (multi-slot aware).
router.post("/bookings/:bookingId/cancel", requireAuth, idempotencyMiddleware(), async (req, res) => {
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

    try {
      await DistributedLockService.withLock(`booking:${bookingId}`, async () => {
        // Restore ALL slots in the time range covered by this booking
        await db
          .update(slotsTable)
      .set({ status: "available", updatedAt: new Date() })
      .where(
        and(
          eq(slotsTable.venueId, booking.venueId),
          eq(slotsTable.date, booking.date),
          gte(slotsTable.startTime, booking.startTime),
          lte(slotsTable.endTime, booking.endTime),
        ),
      );

    // State Machine transition to cancelled
    await MatchBookingMachine.transition(bookingId, "cancelled", "User requested cancellation");

    // Cancellation refund — 50% back to wallet, awaited before response
    const refund = Math.floor(Number(booking.totalAmount) * 0.5);
    if (refund > 0) {
      try {
        await processCancellationRefund(profile.id, bookingId, "booking", refund);
      } catch (e) {
        logger.error({ err: e, bookingId }, "Cancellation refund failed — manual review required");
      }
    }

        const [updatedBooking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
        res.json(formatBooking(updatedBooking, null));
      });
    } catch (err: any) {
      if (err instanceof LockAcquisitionError) {
        res.status(409).json({ error: "conflict", message: "Cancellation in progress." });
        return;
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Error cancelling booking");
    res.status(500).json({ error: "internal_error", message: "Failed to cancel booking" });
  }
});

export default router;
