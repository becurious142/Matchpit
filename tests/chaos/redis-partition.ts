import { test, expect } from "vitest";
import { getQueueConnection } from "../../artifacts/api-server/src/queues/redis";

test("Chaos: Redis connection partition recovery", async () => {
  const redis = getQueueConnection();
  
  // Verify connected
  expect(redis.status).toBe("ready");
  
  // We simulate a network partition by asking the client to forcefully disconnect
  // and we rely on ioredis to auto-reconnect.
  redis.disconnect();
  
  // It should transition to 'end' or 'close'
  expect(["end", "close"]).toContain(redis.status);
  
  // Because BullMQ uses `enableReadyCheck` and `maxRetriesPerRequest: null`,
  // the client will auto-reconnect on the next command or based on its internal loop.
  // We force a reconnect by calling connect() since we explicitly disconnected it above.
  await redis.connect();
  
  expect(redis.status).toBe("ready");
  
  // Verify we can still send commands
  await redis.set("chaos_test_key", "123", "EX", 1);
  const val = await redis.get("chaos_test_key");
  
  expect(val).toBe("123");
});
