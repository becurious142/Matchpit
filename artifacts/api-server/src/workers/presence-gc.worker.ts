import { Worker, Queue } from "bullmq";
import { getQueueConnection } from "../queues/redis";
import { Presence } from "../lib/presence";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { matchPresenceSnapshotsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import ngeohash from "ngeohash";

export const presenceGcQueue = new Queue("presence-gc", {
  connection: getQueueConnection(),
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

const worker = new Worker(
  "presence-gc",
  async (job) => {
    const { type } = job.data ?? {};

    if (type === "snapshot") {
      // Snapshot presence for active matches
      const activeMatchIds = job.data.matchIds as string[];
      for (const matchId of activeMatchIds) {
        const count = await Presence.getCount(matchId);
        if (count > 0) {
          await db.insert(matchPresenceSnapshotsTable).values({
            matchId,
            concurrentViewers: count,
            activeWatchers: count,
            joinVelocity: 0, // Can compute delta vs previous snapshot later
          });
        }
      }
      logger.info({ matchCount: activeMatchIds.length }, "Presence: snapshots written");
    } else {
      // Default: GC expired presence members
      await Presence.gc();
    }
  },
  {
    connection: getQueueConnection(),
    concurrency: 1,
  }
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Presence GC worker failed");
});

export { worker as presenceGcWorker };
