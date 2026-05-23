import { test, expect } from "vitest";
import { getQueueConnection } from "../../artifacts/api-server/src/queues/redis";

test("Chaos: Replay stream MAXLEN trimming enforcement", async () => {
  const redis = getQueueConnection();
  const streamKey = "matchpit:test:stream:trimming";
  
  // Clean up
  await redis.del(streamKey);

  // We simulate 15,000 events being published to the replay stream with MAXLEN ~10000
  // In production, MAXLEN is passed to XADD.
  // We'll simulate our publish logic here:
  for (let i = 0; i < 15000; i++) {
    // MAXLEN ~10000 (the '~' means approximately, which allows Redis to optimize)
    await redis.xadd(streamKey, "MAXLEN", "~", 10000, "*", "event", `test_event_${i}`);
  }

  // Verify the stream length
  const length = await redis.xlen(streamKey);
  
  // It should be bounded (Redis ~ allows it to be slightly over the max length, but not 15,000)
  expect(length).toBeLessThan(11000);
  expect(length).toBeGreaterThanOrEqual(10000);

  // Clean up
  await redis.del(streamKey);
});
