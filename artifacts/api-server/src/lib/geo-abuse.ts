import { getQueueConnection } from "../queues/redis";
import { logger } from "./logger";
import { env } from "../config/env";
import { db } from "@workspace/db";
import { searchAbuseEventsTable } from "@workspace/db";
import { Request } from "express";
import crypto from "crypto";

const redis = getQueueConnection();

const MAX_GEOHASHES_PER_HOUR = 30;
const ABUSE_KEY_PREFIX = "geo_abuse:hourly:";

export interface GeoAbuseCheckResult {
  isAbusive: boolean;
  reason?: string;
}

export const GeoAbuse = {
  /**
   * Evaluates if a request is engaging in abusive geospatial querying behavior.
   * Tracks unique geohashes queried by fingerprint/userId per hour.
   */
  async checkAbuse(
    req: Request,
    userId: string | null,
    geohash: string
  ): Promise<GeoAbuseCheckResult> {
    if (!env.ENABLE_GEO_ABUSE_PROTECTION) return { isAbusive: false };

    try {
      // Create a deterministic identifier combining IP + UA (fallback if no userId)
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || "unknown";
      const ua = req.headers["user-agent"] || "unknown";
      
      const ipHash = crypto.createHash("sha256").update(ip).digest("hex");
      const userAgentHash = crypto.createHash("sha256").update(ua).digest("hex");
      const fingerprintStr = `${ipHash}:${userAgentHash}`;
      const fingerprintHash = crypto.createHash("sha256").update(fingerprintStr).digest("hex");

      const identifier = userId ? `user:${userId}` : `fp:${fingerprintHash}`;
      const hourStr = new Date().toISOString().substring(0, 13); // yyyy-mm-ddTHH
      const trackerKey = `${ABUSE_KEY_PREFIX}${identifier}:${hourStr}`;

      // Add the geohash to the hourly set
      await redis.sadd(trackerKey, geohash);
      await redis.expire(trackerKey, 3600); // 1 hr TTL

      const uniqueCount = await redis.scard(trackerKey);

      if (uniqueCount > MAX_GEOHASHES_PER_HOUR) {
        logger.warn(
          { userId, fingerprintHash, uniqueCount },
          "Geo Abuse detected: excessive unique geohashes"
        );

        // Async log to DB for analytics
        db.insert(searchAbuseEventsTable)
          .values({
            userId,
            ipHash,
            userAgentHash,
            fingerprintHash,
            geohash,
            reason: "geohash_spam",
          })
          .catch((err) => logger.error({ err }, "Failed to write abuse event to DB"));

        return { isAbusive: true, reason: "geohash_spam" };
      }

      return { isAbusive: false };
    } catch (err) {
      logger.error({ err }, "GeoAbuse check failed, failing open");
      return { isAbusive: false };
    }
  },
};
