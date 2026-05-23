/**
 * Chaos testing script to simulate Redis failures during high-concurrency booking.
 * 
 * Usage:
 * 1. Run the API server
 * 2. Run this script via Node.js
 * 3. It will repeatedly pause/resume the local Redis container while firing traffic
 */

const { exec } = require("child_process");
const axios = require("axios");

const toggleRedis = (action) => {
  return new Promise((resolve) => {
    exec(`docker ${action} matchpit-redis-1`, (err) => {
      if (err) console.error(`Failed to ${action} redis:`, err.message);
      else console.log(`Redis ${action}d`);
      resolve();
    });
  });
};

async function fireRequests() {
  const requests = Array(20).fill(null).map(() => 
    axios.post("http://localhost:8080/api/bookings", {
      venueId: "test", slotIds: ["1"], sport: "football"
    }).catch(e => e.response?.status)
  );
  
  const results = await Promise.all(requests);
  console.log("Responses:", results.reduce((acc, status) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {}));
}

async function runChaos() {
  console.log("Starting chaos test...");
  
  // Normal burst
  await fireRequests();

  // Pause redis
  await toggleRedis("pause");
  console.log("Redis paused, expecting graceful degradation (e.g., 503 or fallback)");
  await fireRequests();

  // Resume redis
  await toggleRedis("unpause");
  console.log("Redis unpaused, expecting recovery");
  await fireRequests();
}

runChaos();
