import { pgTable, text, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testInviteStatusEnum = pgEnum("test_invite_status", ["sent", "used", "expired"]);

export const testInvitesTable = pgTable("test_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  status: testInviteStatusEnum("status").notNull().default("sent"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTestInviteSchema = createInsertSchema(testInvitesTable).omit({
  id: true,
  createdAt: true,
});
export const selectTestInviteSchema = createSelectSchema(testInvitesTable);

export type InsertTestInvite = z.infer<typeof insertTestInviteSchema>;
export type TestInvite = typeof testInvitesTable.$inferSelect;
