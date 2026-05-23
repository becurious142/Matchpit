import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const queueReplaysTable = pgTable("queue_replays", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalJobId: text("original_job_id").notNull(),
  queueName: text("queue_name").notNull(),
  replayedBy: uuid("replayed_by")
    .notNull()
    .references(() => profilesTable.id),
  replayReason: text("replay_reason").notNull(),
  replayedAt: timestamp("replayed_at").notNull().defaultNow(),
});
