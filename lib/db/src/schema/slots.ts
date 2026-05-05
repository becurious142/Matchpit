import {
  pgTable,
  text,
  boolean,
  numeric,
  timestamp,
  uuid,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";

export const slotStatusEnum = pgEnum("slot_status", [
  "available",
  "held",
  "booked",
  "unavailable",
]);

export const slotsTable = pgTable("slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venuesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  status: slotStatusEnum("status").notNull().default("available"),
  sport: text("sport"),
  isBlockedByOwner: boolean("is_blocked_by_owner").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSlotSchema = createInsertSchema(slotsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectSlotSchema = createSelectSchema(slotsTable);

export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type Slot = typeof slotsTable.$inferSelect;
