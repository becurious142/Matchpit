import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";
import { hostedMatchesTable } from "./hosted-matches";
import { hostedMatchParticipantsTable } from "./hosted-match-participants";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const attendanceRoleEnum = pgEnum("attendance_role", [
  "host",
  "player",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "pending",
  "confirmed",
  "rejected",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

/**
 * Phase 3: Attendance Verification
 *
 * Records individual host/player confirmations for a match.
 * A quorum of confirmations is required before payouts are released.
 *
 * Uniqueness: one row per (matchId, userId) enforced in application logic.
 */
export const matchAttendanceConfirmationsTable = pgTable(
  "match_attendance_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => hostedMatchesTable.id, { onDelete: "cascade" }),
    // Null for host (host is not a participant row)
    participantId: uuid("participant_id").references(
      () => hostedMatchParticipantsTable.id,
      { onDelete: "set null" }
    ),
    userId: uuid("user_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    role: attendanceRoleEnum("role").notNull(),
    status: attendanceStatusEnum("status").notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const insertAttendanceConfirmationSchema = createInsertSchema(
  matchAttendanceConfirmationsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export const selectAttendanceConfirmationSchema = createSelectSchema(
  matchAttendanceConfirmationsTable
);

export type InsertAttendanceConfirmation = z.infer<
  typeof insertAttendanceConfirmationSchema
>;
export type AttendanceConfirmation =
  typeof matchAttendanceConfirmationsTable.$inferSelect;
