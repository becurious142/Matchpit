import {
  pgTable,
  text,
  numeric,
  boolean,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralConfigTable = pgTable("referral_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReferralConfigSchema = createInsertSchema(referralConfigTable).omit({
  id: true,
  updatedAt: true,
});

export const selectReferralConfigSchema = createSelectSchema(referralConfigTable);

export type InsertReferralConfig = z.infer<typeof insertReferralConfigSchema>;
export type ReferralConfig = typeof referralConfigTable.$inferSelect;
