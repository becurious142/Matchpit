import {
  pgTable,
  text,
  numeric,
  timestamp,
  date,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ownerLeadStatusEnum = pgEnum("owner_lead_status", [
  "new",
  "contacted",
  "demo",
  "onboarded",
  "rejected",
]);

export const ownerLeadsTable = pgTable("owner_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  venueName: text("venue_name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  sports: text("sports").array().notNull().default([]),
  message: text("message"),
  status: ownerLeadStatusEnum("status").notNull().default("new"),
  contactedOn: timestamp("contacted_on"),
  followupDate: date("followup_date"),
  notes: text("notes"),
  assignedAdmin: text("assigned_admin"),
  expectedInventoryValue: numeric("expected_inventory_value", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOwnerLeadSchema = createInsertSchema(ownerLeadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOwnerLeadSchema = createSelectSchema(ownerLeadsTable);

export type InsertOwnerLead = z.infer<typeof insertOwnerLeadSchema>;
export type OwnerLead = typeof ownerLeadsTable.$inferSelect;
