import { db } from "@workspace/db";
import { ReplicaHealth } from "./replica-health";
import { logger } from "./logger";

// Placeholder for actual replica DB connection setup
const replicaDb = process.env.READ_REPLICA_URL ? db /* replace with drizzle(replicaPool) */ : db;

export const DbRouting = {
  getPrimaryDb() {
    return db;
  },

  getReplicaDb() {
    if (process.env.READ_REPLICA_URL && ReplicaHealth.isReplicaHealthy()) {
      return replicaDb;
    }
    // Fallback to primary if no replica is configured or replica is lagging
    return db; 
  }
};
