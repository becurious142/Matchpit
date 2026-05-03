import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  bookingsTable,
  profilesTable,
  venuesTable,
  slotsTable,
  paymentsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { verifyRazorpaySignature } from "../lib/razorpay";

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
        ? await db
            .select()
            .from(venuesTable)
            .where(eq(venuesTable.id, venueIds[0]))
        : [];
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    res.json(bookings.map((b) => formatBooking(b, venueMap.get(b.venueId) ?? null)));
  } catch (err) {
    req.log.error({ err }, "Error listing bookings");
    res.status(500).json({ error: "internal_error", message: "Failed to list bookings" });
  }
});

router.post("/bookings", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { venueId, slotId, sport, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      req.body;

    // Verify Razorpay signature
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      res.status(400).json({ error: "invalid_signature", message: "Payment signature invalid" });
      return;
    }

    // Get slot info
    const [slot] = await db
      .select()
      .from(slotsTable)
      .where(eq(slotsTable.id, slotId))
      .limit(1);

    if (!slot) {
      res.status(404).json({ error: "not_found", message: "Slot not found" });
      return;
    }

    if (slot.status !== "available") {
      res.status(409).json({ error: "slot_unavailable", message: "Slot is no longer available" });
      return;
    }

    // Get venue for pricing
    const [venue] = await db
      .select()
      .from(venuesTable)
      .where(eq(venuesTable.id, venueId))
      .limit(1);

    if (!venue) {
      res.status(404).json({ error: "not_found", message: "Venue not found" });
      return;
    }

    const totalAmount = slot.priceOverride ?? venue.pricePerHour;

    // Create payment record
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        userId: profile.id,
        type: "booking",
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        amount: totalAmount,
        status: "success",
      })
      .returning();

    // Mark slot as booked
    await db
      .update(slotsTable)
      .set({ status: "booked", updatedAt: new Date() })
      .where(eq(slotsTable.id, slotId));

    // Create booking
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        userId: profile.id,
        venueId,
        slotId,
        sport,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        totalAmount,
        status: "confirmed",
        paymentId: payment.id,
        razorpayOrderId,
        razorpayPaymentId,
      })
      .returning();

    // Update payment referenceId
    await db
      .update(paymentsTable)
      .set({ referenceId: booking.id })
      .where(eq(paymentsTable.id, payment.id));

    // Create notification
    await db.insert(notificationsTable).values({
      userId: profile.id,
      type: "payment_success",
      title: "Booking Confirmed!",
      body: `Your booking at ${venue.name} on ${slot.date} (${slot.startTime} - ${slot.endTime}) is confirmed.`,
      referenceId: booking.id,
    });

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

    const { bookingId } = req.params;
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
    req.log.error({ err }, "Error fetching booking" );
    res.status(500).json({ error: "internal_error", message: "Failed to fetch booking" });
  }
});

router.post("/bookings/:bookingId/cancel", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await getProfileByClerkId(userId!);
    if (!profile) {
      res.status(404).json({ error: "not_found", message: "Profile not found" });
      return;
    }

    const { bookingId } = req.params;
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

    // Free the slot
    await db
      .update(slotsTable)
      .set({ status: "available", updatedAt: new Date() })
      .where(eq(slotsTable.id, booking.slotId));

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    res.json(formatBooking(updated, null));
  } catch (err) {
    req.log.error({ err }, "Error cancelling booking");
    res.status(500).json({ error: "internal_error", message: "Failed to cancel booking" });
  }
});

export default router;
