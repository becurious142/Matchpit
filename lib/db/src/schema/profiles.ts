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

export const profilesTable = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  city: text("city"),
  favoriteSports: text("favorite_sports").array().notNull().default([]),
  avatarUrl: text("avatar_url"),
  walletBalance: numeric("wallet_balance", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  walletAutoUse: boolean("wallet_auto_use").notNull().default(false),
  badgeCount: integer("badge_count").notNull().default(0),
  trustScore: numeric("trust_score", { precision: 5, scale: 2 })
    .notNull()
    .default("100"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  signupBonusPaid: boolean("signup_bonus_paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectProfileSchema = createSelectSchema(profilesTable);

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
