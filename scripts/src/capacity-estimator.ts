/**
 * Capacity Estimator
 *
 * This script calculates hardware sizing, bandwidth, connection pools, and Redis memory growth
 * based on the target Phase 16 launch load.
 */

interface EstimationTargets {
  concurrentSse: number;
  concurrentBookings: number;
  discoveryReqPerSec: number;
}

function runEstimations(targets: EstimationTargets) {
  console.log(`\n📊 MATCHPIT Capacity Estimations`);
  console.log(`================================`);
  console.log(`Targets:`);
  console.log(` - SSE Clients: ${targets.concurrentSse}`);
  console.log(` - Booking/sec: ${targets.concurrentBookings}`);
  console.log(` - Discovery/sec: ${targets.discoveryReqPerSec}`);
  console.log(`\n---`);

  // 1. Connection Pools
  // Each SSE doesn't necessarily hold a DB connection, but bookings and discovery do.
  // Bookings require transactions (holding conn for ~100ms).
  const dbConnectionsForBookings = (targets.concurrentBookings * 0.1); 
  const dbConnectionsForDiscovery = (targets.discoveryReqPerSec * 0.05); // 50ms latency assumption
  
  // Total DB pool = active usage + 50% buffer
  const recommendedDbPool = Math.ceil((dbConnectionsForBookings + dbConnectionsForDiscovery) * 1.5);

  console.log(`\n🗄️  PostgreSQL Recommendations:`);
  console.log(` - Min PgBouncer Pool Size: ${recommendedDbPool} connections`);
  console.log(` - Recommended Instance: Minimum 4 vCPU, 16GB RAM for optimal PostGIS index fitting.`);

  // 2. Redis Memory & Streams
  // Replay stream: 50 bytes per event, 5k clients.
  // 1 hour of history at 100 events/sec = 360,000 events = ~18MB per stream.
  const redisMemoryForReplayMB = 250; // Buffer for multiple active streams
  
  // Cache for discovery (100k venues, 2KB per entry)
  const redisMemoryForGeoCacheMB = Math.ceil((100000 * 2048) / (1024 * 1024)); 
  
  const recommendedRedisMem = Math.ceil((redisMemoryForReplayMB + redisMemoryForGeoCacheMB) * 2);

  console.log(`\n🔴 Redis Recommendations:`);
  console.log(` - Estimated Memory Needed: ${redisMemoryForReplayMB + redisMemoryForGeoCacheMB} MB`);
  console.log(` - Recommended Instance Size: ${recommendedRedisMem} MB (allows for spikes & fragmentation)`);

  // 3. API Node.js instances (Vercel / Docker)
  // Each node instance can handle ~1000 SSE connections safely.
  const requiredNodeInstances = Math.ceil(targets.concurrentSse / 1000);
  
  console.log(`\n🌐 API Server Recommendations:`);
  console.log(` - Min Node.js Instances (Replicas): ${requiredNodeInstances} (assuming 1 CPU / 1GB RAM each)`);
  console.log(` - Max Memory Limit (per instance): 1024MB (to avoid V8 GC pauses)`);

  // 4. Bandwidth
  // SSE Heartbeat (1 byte/sec) + Events (500 bytes/min)
  const bandwidthPerClientKbps = (1 * 8) + ((500 * 8) / 60);
  const totalBandwidthMbps = (targets.concurrentSse * bandwidthPerClientKbps) / 1000;

  console.log(`\n📡 Network Recommendations:`);
  console.log(` - Required SSE Egress Bandwidth: ~${totalBandwidthMbps.toFixed(2)} Mbps`);
  console.log(`\n================================\n`);
}

function main() {
  // Stage 1
  console.log(`\n[ STAGE 1 TARGETS ]`);
  runEstimations({
    concurrentSse: 1000,
    concurrentBookings: 100,
    discoveryReqPerSec: 50,
  });

  // Stage 3 (Full Target)
  console.log(`\n[ STAGE 3 FULL LOAD ]`);
  runEstimations({
    concurrentSse: 5000,
    concurrentBookings: 1000,
    discoveryReqPerSec: 200,
  });
}

main();
