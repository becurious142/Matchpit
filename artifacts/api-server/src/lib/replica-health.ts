import { db, sql } from "@workspace/db";
import { logger } from "./logger";

let replicaLagSeconds = 0;
const MAX_LAG_SECONDS = 10; // If lag exceeds 10s, fallback to primary

export const ReplicaHealth = {
  /**
   * Monitor replication lag. Should be called via a cron/interval.
   * Assumes PostgreSQL replication.
   */
  async checkLag() {
    try {
      // In a real environment with read replicas configured, you query the replica's lag:
      // SELECT extract(epoch from now() - pg_last_xact_replay_timestamp()) as lag;
      // Since this is a setup without active replicas in dev, we mock the result.
      
      const result = await db.execute(sql`
        SELECT CASE WHEN pg_is_in_recovery() 
          THEN extract(epoch from now() - pg_last_xact_replay_timestamp())
          ELSE 0 
        END as lag;
      `);
      
      replicaLagSeconds = Number(result.rows[0]?.lag || 0);
      
      if (replicaLagSeconds > MAX_LAG_SECONDS) {
        logger.warn({ lag: replicaLagSeconds }, "Replica lag exceeded threshold, routing to primary");
      }
    } catch (err) {
      logger.error({ err }, "Failed to check replica lag");
      // Fallback to primary on check failure
      replicaLagSeconds = MAX_LAG_SECONDS + 1; 
    }
  },

  isReplicaHealthy(): boolean {
    return replicaLagSeconds <= MAX_LAG_SECONDS;
  }
};
