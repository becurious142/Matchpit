import { pgTable, text, uuid, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const squadMemberRoleEnum = pgEnum("squad_member_role", ["captain", "member"]);
export const squadChallengeStatusEnum = pgEnum("squad_challenge_status", [
  "pending",
  "accepted",
  "rejected",
  "completed",
]);

export const squadsTable = pgTable("squads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  cityId: uuid("city_id"),
  sport: text("sport").notNull(),
  captainUserId: uuid("captain_user_id").notNull(),
  description: text("description"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  trustRating: numeric("trust_rating", { precision: 4, scale: 2 }).notNull().default("4.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const squadMembersTable = pgTable("squad_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: squadMemberRoleEnum("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const squadPostsTable = pgTable("squad_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull(),
  userId: uuid("user_id").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const squadChallengesTable = pgTable("squad_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengerSquadId: uuid("challenger_squad_id").notNull(),
  opponentSquadId: uuid("opponent_squad_id").notNull(),
  proposedDate: text("proposed_date").notNull(),
  proposedSlotId: uuid("proposed_slot_id"),
  sport: text("sport").notNull(),
  status: squadChallengeStatusEnum("status").notNull().default("pending"),
  hostedMatchId: uuid("hosted_match_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSquadSchema = createInsertSchema(squadsTable).omit({
  id: true,
  wins: true,
  losses: true,
  trustRating: true,
  createdAt: true,
  updatedAt: true,
});
export const selectSquadSchema = createSelectSchema(squadsTable);

export type InsertSquad = z.infer<typeof insertSquadSchema>;
export type Squad = typeof squadsTable.$inferSelect;
export type SquadMember = typeof squadMembersTable.$inferSelect;
export type SquadPost = typeof squadPostsTable.$inferSelect;
export type SquadChallenge = typeof squadChallengesTable.$inferSelect;
