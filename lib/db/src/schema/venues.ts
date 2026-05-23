import {
  pgTable,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./cities";
import { geography } from "./geo";
import { index } from "drizzle-orm/pg-core";

export const venuesTable = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  cityId: uuid("city_id").references(() => citiesTable.id),
  address: text("address").notNull(),
  sports: text("sports").array().notNull().default([]),
  pricePerHour: numeric("price_per_hour", { precision: 10, scale: 2 }).notNull(),
  weekdayMorningPrice: integer("weekday_morning_price").notNull().default(0),
  weekdayDayPrice: integer("weekday_day_price").notNull().default(0),
  weekdayEveningPrice: integer("weekday_evening_price").notNull().default(0),
  weekendPrice: integer("weekend_price").notNull().default(0),
  slotIntervalMins: integer("slot_interval_mins").notNull().default(60),
  coverImage: text("cover_image"),
  images: text("images").array().notNull().default([]),
  description: text("description"),
  openTime: text("open_time").notNull().default("06:00"),
  closeTime: text("close_time").notNull().default("23:00"),
  contactPhone: text("contact_phone"),
  ownerName: text("owner_name"),
  ownerUserId: uuid("owner_user_id"),
  amenities: text("amenities").array().notNull().default([]),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("4.5"),
  totalReviews: integer("total_reviews").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  isOnboardingDraft: boolean("is_onboarding_draft").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  coordinates: geography("coordinates"),
}, (table) => ({
  coordinatesIdx: index("venue_coordinates_idx").using("gist", table.coordinates),
}));

export const insertVenueSchema = createInsertSchema(venuesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectVenueSchema = createSelectSchema(venuesTable);

export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
