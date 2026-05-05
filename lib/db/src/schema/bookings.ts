import {
  pgTable,
  text,
  numeric,
  timestamp,
  uuid,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";
import { slotsTable } from "./slots";
import { profilesTable } from "./profiles";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
]);

export const bookingsTable = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venuesTable.id),
  slotId: uuid("slot_id")
    .notNull()
    .references(() => slotsTable.id),
  sport: text("sport").notNull(),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: bookingStatusEnum("status").notNull().default("pending_payment"),
  paymentId: uuid("payment_id"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectBookingSchema = createSelectSchema(bookingsTable);

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
