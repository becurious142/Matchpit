import {
  pgTable,
  timestamp,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";
import { hostedMatchesTable } from "./hosted-matches";

export const participantStatusEnum = pgEnum("participant_status", [
  "reserved",
  "final_paid",
  "cancelled",
]);

export const hostedMatchParticipantsTable = pgTable("hosted_match_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => hostedMatchesTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  status: participantStatusEnum("status").notNull().default("reserved"),
  reservePaymentId: uuid("reserve_payment_id"),
  finalPaymentId: uuid("final_payment_id"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHostedMatchParticipantSchema = createInsertSchema(
  hostedMatchParticipantsTable,
).omit({ id: true, joinedAt: true, updatedAt: true });

export const selectHostedMatchParticipantSchema = createSelectSchema(
  hostedMatchParticipantsTable,
);

export type InsertHostedMatchParticipant = z.infer<typeof insertHostedMatchParticipantSchema>;
export type HostedMatchParticipant = typeof hostedMatchParticipantsTable.$inferSelect;
