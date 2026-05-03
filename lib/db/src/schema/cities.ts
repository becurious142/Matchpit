import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citiesTable = pgTable("city_master", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityName: text("city_name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  launchPriority: integer("launch_priority").notNull().default(99),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCitySchema = createInsertSchema(citiesTable).omit({
  id: true,
  createdAt: true,
});

export const selectCitySchema = createSelectSchema(citiesTable);

export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof citiesTable.$inferSelect;
