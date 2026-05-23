import { getQueueConnection } from "../../queues/redis";
import { DomainEvent } from "./domain-events";
import { logger } from "../logger";

const REDIS_STREAM_PREFIX = "matchpit:stream:";
// Limit stream length to ~10,000 entries (with approximate trimming ~) to prevent memory bloat
const MAX_STREAM_LENGTH = 10000; 

const redisPublisher = getQueueConnection();

export const EventStream = {
  /**
   * Appends an event to a Redis Stream with a max length constraint.
   * Returns the generated Redis Stream ID (timestamp-sequence).
   */
  async append(event: DomainEvent): Promise<string | null> {
    try {
      const streamKey = `${REDIS_STREAM_PREFIX}${event.eventType}`;
      
      // XADD key MAXLEN ~ count * field string value string ...
      // Using approximate trimming ('~') is much more efficient in Redis.
      const id = await redisPublisher.xadd(
        streamKey,
        "MAXLEN",
        "~",
        MAX_STREAM_LENGTH,
        "*", // auto-generate ID based on timestamp
        "payload",
        JSON.stringify(event)
      );
      
      return id as string;
    } catch (err) {
      logger.error({ err, eventId: event.eventId }, "Failed to append to Redis Stream");
      return null;
    }
  },

  /**
   * Read events from a stream starting AFTER the given lastEventId.
   * Useful for reconnecting clients fetching missed events.
   */
  async readSince(eventType: string, lastEventId: string = "0-0"): Promise<Array<{ id: string; event: DomainEvent }>> {
    try {
      const streamKey = `${REDIS_STREAM_PREFIX}${eventType}`;
      // XREAD COUNT 1000 STREAMS key lastEventId
      const result = await redisPublisher.xread("COUNT", 1000, "STREAMS", streamKey, lastEventId);
      
      if (!result || result.length === 0) return [];
      
      // result format for single stream: [ [streamKey, [ [id, ["payload", jsonString]], ... ] ] ]
      const streamData = result[0]?.[1] || [];
      
      return streamData.map((entry: any) => {
        const id = entry[0];
        const fields = entry[1]; // array of alternating keys and values
        const payloadIdx = fields.indexOf("payload");
        const jsonStr = payloadIdx >= 0 ? fields[payloadIdx + 1] : "{}";
        
        return {
          id,
          event: JSON.parse(jsonStr)
        };
      });
    } catch (err) {
      logger.error({ err, eventType }, "Failed to read from Redis Stream");
      return [];
    }
  }
};
