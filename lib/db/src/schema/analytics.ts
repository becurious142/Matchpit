import { pgTable, text, integer, timestamp, uuid, jsonb, boolean } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const searchAnalyticsTable = pgTable("search_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profilesTable.id), // Nullable for anonymous or unauthenticated searches
  searchType: text("search_type").notNull(), // 'venues' or 'matches'
  geohashBucket: text("geohash_bucket").notNull(), // precision 6
  sport: text("sport"),
  radiusKm: integer("radius_km").notNull(),
  resultsCount: integer("results_count").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  cacheHit: boolean("cache_hit").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const searchAbuseEventsTable = pgTable("search_abuse_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profilesTable.id), // Nullable
  ipHash: text("ip_hash").notNull(),
  userAgentHash: text("user_agent_hash"),
  fingerprintHash: text("fingerprint_hash"),
  geohash: text("geohash"),
  reason: text("reason").notNull(), // e.g., 'rapid_hopping', 'geohash_spam'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const matchPresenceSnapshotsTable = pgTable("match_presence_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull(), // Assuming foreign key elsewhere, or just uuid
  concurrentViewers: integer("concurrent_viewers").notNull().default(0),
  activeWatchers: integer("active_watchers").notNull().default(0),
  joinVelocity: integer("join_velocity").notNull().default(0),
  snapshotTs: timestamp("snapshot_ts").notNull().defaultNow(),
});
