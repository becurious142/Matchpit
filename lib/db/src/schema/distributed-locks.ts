import { pgTable, text, timestamp, bigint } from "drizzle-orm/pg-core";

export const distributedLocksTable = pgTable("distributed_locks", {
  resourceId: text("resource_id").primaryKey(), // e.g. "match:123", "wallet:456"
  lockVersion: bigint("lock_version", { mode: "number" }).notNull().default(0),
  lockedAt: timestamp("locked_at", { mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
});
