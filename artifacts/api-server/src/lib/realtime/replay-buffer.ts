import { EventStream } from "../events/event-stream";
import { logger } from "../logger";

export const ReplayBuffer = {
  /**
   * Replays missed events for a given channel starting from `lastEventId`.
   * Sends the events to the SSE client response stream.
   */
  async replay(channel: string, lastEventId: string, res: any) {
    try {
      // EventType from event-bus is derived from channel.
      // e.g., channel="realtime:discovery:xxx", eventType="discovery:xxx"
      // Wait, in event-bus.ts: channel = `${REDIS_PUBSUB_PREFIX}${event.eventType}`
      // The SSE channel name doesn't have "matchpit:events:", it has "realtime:..."
      // But wait, the previous code mapped SSE channel to bufferKey.
      // In EventStream.append, streamKey = `matchpit:stream:${event.eventType}`.
      // We need the original eventType.
      
      const eventType = channel.replace("realtime:", ""); 
      
      const missedEvents = await EventStream.readSince(eventType, lastEventId);
      
      for (const { id, event } of missedEvents) {
        // SSE formatting requires `id:` to track the Stream ID for future reconnects.
        res.write(`event: ${event.eventType}\ndata: ${JSON.stringify(event.payload)}\nid: ${id}\n\n`);
      }
    } catch (err) {
      logger.error({ err, channel, lastEventId }, "Failed to replay SSE buffer from Streams");
    }
  }
};
