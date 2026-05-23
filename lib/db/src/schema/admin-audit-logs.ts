import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const adminAuditLogsTable = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => profilesTable.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(), // 'batch' | 'payout' | 'refund'
  targetId: uuid("target_id"),
  payload: jsonb("payload").default({}),
  ipHash: text("ip_hash"), // Added for Phase 14 Immutable Audit
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});
