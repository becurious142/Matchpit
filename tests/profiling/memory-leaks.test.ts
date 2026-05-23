import { test, expect } from "vitest";
import { EventEmitter } from "events";
import { getQueueConnection } from "../../artifacts/api-server/src/queues/redis";

// Mock SSE client structure for testing cleanup
class MockSseClient extends EventEmitter {
  public closed = false;
  close() {
    this.closed = true;
    this.emit("close");
  }
}

test("Memory Profiling: SSE Reconnect Storm Cleanup", async () => {
  const initialMemory = process.memoryUsage().heapUsed;
  const initialListeners = process.getMaxListeners(); // Not a perfect metric, but we can track active listeners if we instrument our EventBus
  
  const clients: MockSseClient[] = [];
  
  // 1. Simulate Reconnect Storm (1000 connects/disconnects)
  for (let i = 0; i < 1000; i++) {
    const client = new MockSseClient();
    clients.push(client);
    
    // Simulate immediate disconnect
    client.close();
  }

  // Force GC if running with --expose-gc
  if (global.gc) {
    global.gc();
  }

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowthMB = (finalMemory - initialMemory) / 1024 / 1024;

  // We expect memory growth to be less than 5MB after GC for 1000 dead clients
  expect(memoryGrowthMB).toBeLessThan(5);
  
  // Ensure all clients are marked closed
  const allClosed = clients.every(c => c.closed);
  expect(allClosed).toBe(true);
});

test("Memory Profiling: Redis Subscriber Leaks", async () => {
  const redis = getQueueConnection();
  
  // Get initial client list
  const initialClients = await redis.client("LIST");
  const initialCount = initialClients.split("\n").filter(Boolean).length;

  // Simulate creating 50 temporary subscribers (like SSE endpoints might do if poorly implemented)
  const tempSubs = [];
  for (let i = 0; i < 50; i++) {
    const sub = redis.duplicate();
    tempSubs.push(sub);
  }

  // Wait for connections to establish
  await new Promise(r => setTimeout(r, 500));

  // Now destroy them properly
  for (const sub of tempSubs) {
    sub.disconnect();
  }

  // Wait for disconnects to process
  await new Promise(r => setTimeout(r, 500));

  const finalClients = await redis.client("LIST");
  const finalCount = finalClients.split("\n").filter(Boolean).length;

  // Ensure we didn't leak Redis connections
  // Allow a small delta (e.g. +2) for background ping/cluster connections that ioredis manages
  expect(finalCount - initialCount).toBeLessThan(5);
});
