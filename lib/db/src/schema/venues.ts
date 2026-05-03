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

export const venuesTable = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  cityId: uuid("city_id").references(() => citiesTable.id),
  address: text("address").notNull(),
  sports: text("sports").array().notNull().default([]),
  pricePerHour: numeric("price_per_hour", { precision: 10, scale: 2 }).notNull(),
  coverImage: text("cover_image"),
  images: text("images").array().notNull().default([]),
  description: text("description"),
  openTime: text("open_time").notNull().default("06:00"),
  closeTime: text("close_time").notNull().default("23:00"),
  contactPhone: text("contact_phone"),
  ownerName: text("owner_name"),
  amenities: text("amenities").array().notNull().default([]),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("4.5"),
  totalReviews: integer("total_reviews").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venuesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectVenueSchema = createSelectSchema(venuesTable);

export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
