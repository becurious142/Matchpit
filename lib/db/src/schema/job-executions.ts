import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Phase 8 — job_executions table.
 *
 * Write-ahead audit trail for all BullMQ jobs. Provides financial-grade
 * durability beyond BullMQ's ephemeral Redis state.
 *
 * Row is created with status "pending" BEFORE queue.add() is called.
 * If Redis is down, pending rows surface for manual recovery.
 */
export const jobExecutionsTable = pgTable("job_executions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  queueName:    text("queue_name").notNull(),
  jobType:      text("job_type").notNull(),
  bullmqJobId:  text("bullmq_job_id"),
  referenceId:  text("reference_id"),
  attempts:     integer("attempts").default(0),
  status:       text("status").notNull().default("pending"),
  startedAt:    timestamp("started_at", { withTimezone: true }),
  completedAt:  timestamp("completed_at", { withTimezone: true }),
  durationMs:   integer("duration_ms"),
  errorPayload: jsonb("error_payload"),
  metadata:     jsonb("metadata"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
});
