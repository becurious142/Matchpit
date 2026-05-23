import { pgTable, text, numeric, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const settlementBatchesTable = pgTable("settlement_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchReference: text("batch_reference").notNull().unique(),
  status: text("status").notNull(), // 'batched' | 'processing' | 'paid' | 'partially_paid' | 'failed'
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  totalPayouts: integer("total_payouts").notNull().default(0),
  createdBy: uuid("created_by")
    .references(() => profilesTable.id),
  processedAt: timestamp("processed_at"),
  settledAt: timestamp("settled_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
