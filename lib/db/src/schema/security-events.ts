import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const securityEventsTable = pgTable("security_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profilesTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), // 'ip_drift' | 'brute_force' | 'admin_escalation' | 'session_rotation'
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
