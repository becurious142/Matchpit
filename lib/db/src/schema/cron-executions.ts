import { pgTable, text, timestamp, uuid, integer, jsonb } from "drizzle-orm/pg-core";

export const cronExecutionsTable = pgTable("cron_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: text("job_name").notNull(),
  jobKey: text("job_key").notNull(), // Unique correlator (e.g., jobName + timestamp)
  triggerSource: text("trigger_source").notNull().default("cron"), // cron | manual | retry | startup
  status: text("status").notNull().default("running"), // running | success | failed | timeout
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
});
