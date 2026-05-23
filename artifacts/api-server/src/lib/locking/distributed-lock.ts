import { getQueueConnection } from "../../queues/redis";
import { db } from "@workspace/db";
import { distributedLocksTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../logger";

import { env } from "../../config/env";

const redis = getQueueConnection();
const envPrefix = env.NODE_ENV || "development";
const LOCK_PREFIX = `matchpit:${envPrefix}:dlock:`;

export interface DistributedLock {
  resourceId: string;
  token: string;
  version: number;
  release: () => Promise<void>;
}

export class LockAcquisitionError extends Error {
  constructor(resourceId: string, message: string) {
    super(`Failed to acquire lock for ${resourceId}: ${message}`);
    this.name = "LockAcquisitionError";
  }
}

export const DistributedLockService = {
  /**
   * Acquires a distributed lock using Redis and PostgreSQL fencing tokens.
   * 1. Acquires a Redis TTL lock using SET NX.
   * 2. Upserts a row in the `distributed_locks` Postgres table to increment and retrieve the `lock_version`.
   * 
   * The returned `version` should be validated in subsequent DB transactions to prevent split-brain writes.
   * 
   * @param resourceId Unique identifier for the resource (e.g. "match:123")
   * @param ttlMs Time to live for the Redis lock in milliseconds (default: 30000)
   */
  async acquire(resourceId: string, ttlMs: number = 30000): Promise<DistributedLock> {
    const lockKey = `${LOCK_PREFIX}${resourceId}`;
    const token = randomUUID();

    // 1. Acquire Redis Lock (SET NX PX)
    const acquired = await redis.set(lockKey, token, "PX", ttlMs, "NX");
    if (!acquired) {
      throw new LockAcquisitionError(resourceId, "Resource is currently locked by another process.");
    }

    try {
      // 2. Generate Fencing Token (Postgres lock version increment)
      const expiresAt = new Date(Date.now() + ttlMs);
      
      const result = await db
        .insert(distributedLocksTable)
        .values({
          resourceId,
          lockVersion: 1,
          lockedAt: new Date(),
          expiresAt,
        })
        .onConflictDoUpdate({
          target: distributedLocksTable.resourceId,
          set: {
            lockVersion: sql`${distributedLocksTable.lockVersion} + 1`,
            lockedAt: new Date(),
            expiresAt,
          },
        })
        .returning({ lockVersion: distributedLocksTable.lockVersion });

      const version = result[0].lockVersion;
      
      logger.debug({ resourceId, token, version }, "Distributed lock acquired");

      const release = async () => {
        // Lua script to safely release the lock only if the token matches
        const releaseScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await redis.eval(releaseScript, 1, lockKey, token);
        logger.debug({ resourceId, token, version }, "Distributed lock released");
      };

      return {
        resourceId,
        token,
        version,
        release,
      };
    } catch (err) {
      // Rollback Redis lock if DB token generation fails
      await redis.del(lockKey);
      throw new LockAcquisitionError(resourceId, "Failed to generate fencing token in DB.");
    }
  },

  /**
   * Helper to execute a function within a lock.
   * Automatically releases the lock when the function completes or throws.
   */
  async withLock<T>(
    resourceId: string,
    fn: (lock: DistributedLock) => Promise<T>,
    ttlMs: number = 30000
  ): Promise<T> {
    const lock = await this.acquire(resourceId, ttlMs);
    try {
      return await fn(lock);
    } finally {
      await lock.release();
    }
  }
};
