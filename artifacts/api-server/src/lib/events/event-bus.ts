import { getQueueConnection } from "../../queues/redis";
import { DomainEvent } from "./domain-events";
import { logger } from "../logger";
import { env } from "../../config/env";
import { EventStream } from "./event-stream";
import Redis from "ioredis";

const REDIS_PUBSUB_PREFIX = "matchpit:events:";
const redisPublisher = getQueueConnection();
// We need a dedicated subscriber connection for Redis Pub/Sub
const redisSubscriber = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

type EventCallback = (event: DomainEvent) => void | Promise<void>;
const subscribers = new Map<string, EventCallback[]>();

// Initialize the single subscriber connection
if (env.ENABLE_EVENT_BUS) {
  redisSubscriber.on("message", async (channel, message) => {
    if (!channel.startsWith(REDIS_PUBSUB_PREFIX)) return;
    
    const eventType = channel.replace(REDIS_PUBSUB_PREFIX, "");
    const callbacks = subscribers.get(eventType) || [];
    
    if (callbacks.length === 0) return;

    try {
      const event: DomainEvent = JSON.parse(message);
      logger.debug({ eventId: event.eventId, eventType }, "Received domain event");

      // Execute callbacks safely without crashing the subscriber
      await Promise.allSettled(callbacks.map(cb => cb(event)));
    } catch (err) {
      logger.error({ err, channel, message }, "Failed to process domain event");
    }
  });
}

export const EventBus = {
  async publish(event: DomainEvent): Promise<void> {
    if (!env.ENABLE_EVENT_BUS) return;

    try {
      const channel = `${REDIS_PUBSUB_PREFIX}${event.eventType}`;
      const payloadString = JSON.stringify(event);
      
      const pipeline = redisPublisher.pipeline();
      pipeline.publish(channel, payloadString);
      await pipeline.exec();

      // Append to Redis Streams for replay buffers
      await EventStream.append(event);
      
      logger.debug({ eventId: event.eventId, eventType: event.eventType }, "Published domain event");
    } catch (err) {
      logger.error({ err, eventId: event.eventId }, "Failed to publish domain event");
    }
  },

  subscribe(eventType: string, callback: EventCallback): void {
    if (!env.ENABLE_EVENT_BUS) return;

    let callbacks = subscribers.get(eventType);
    if (!callbacks) {
      callbacks = [];
      subscribers.set(eventType, callbacks);
      // Subscribe to the channel if this is the first callback
      const channel = `${REDIS_PUBSUB_PREFIX}${eventType}`;
      redisSubscriber.subscribe(channel).catch(err => {
        logger.error({ err, channel }, "Failed to subscribe to Redis channel");
      });
    }
    callbacks.push(callback);
  }
};
