import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";
import { hostedMatchesTable } from "./hosted-matches";
import { paymentsTable } from "./payments";
import { hostedMatchParticipantsTable } from "./hosted-match-participants";

export const hostedMatchReservationsTable = pgTable(
  "hosted_match_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => hostedMatchesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    paymentOrderId: text("payment_order_id"),
    paymentId: uuid("payment_id").references(() => paymentsTable.id, { onDelete: "set null" }),
    reservationStatus: text("reservation_status", {
      // HM10 PATCH 2: Expanded with payment_captured and awaiting_conversion states
      // to allow explicit webhook state machine progression.
      enum: ["pending_payment", "payment_captured", "awaiting_conversion", "paid", "expired", "converted", "cancelled"],
    }).notNull().default("pending_payment"),
    // HM10 PATCH 2 — Synthetic is_active boolean for production-safe unique index.
    // Active (non-terminal) reservations: is_active = true.
    // Terminal (expired / converted / cancelled): is_active = false.
    // This avoids relying on partial index enum-string comparisons which are brittle
    // across Drizzle migration generation and can silently break on schema evolution.
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at").notNull(),
    convertedParticipantId: uuid("converted_participant_id").references(
      () => hostedMatchParticipantsTable.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // HM10 PATCH 2 — UNIQUE(userId, matchId) WHERE is_active = true.
    // Only one active slot reservation per user per match.
    // Expired/converted/cancelled rows set is_active=false and fall outside this constraint,
    // allowing historical records without violating uniqueness.
    uniqueActiveReservationIdx: uniqueIndex("idx_unique_active_reservation")
      .on(table.userId, table.matchId)
      .where(sql`is_active = true`),
  })
);

export const insertHostedMatchReservationSchema = createInsertSchema(hostedMatchReservationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectHostedMatchReservationSchema = createSelectSchema(hostedMatchReservationsTable);

export type InsertHostedMatchReservation = z.infer<typeof insertHostedMatchReservationSchema>;
export type HostedMatchReservation = typeof hostedMatchReservationsTable.$inferSelect;
