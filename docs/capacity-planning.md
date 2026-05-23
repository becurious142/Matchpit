# MATCHPIT Capacity Planning

This document outlines the expected infrastructure requirements, scaling thresholds, and cost estimations for the Phase 16 load targets.

## Target Baselines

### Stage 1 (Initial Release)
- **Concurrent SSE Clients:** 1,000
- **Bookings/sec:** 100
- **Discovery Req/sec:** 50

### Stage 3 (Target Scale)
- **Concurrent SSE Clients:** 5,000
- **Bookings/sec:** 1,000
- **Discovery Req/sec:** 200

---

## Infrastructure Scaling Thresholds

### 1. PostgreSQL (with PostGIS)
**Load characteristics:** Heavy bounding box queries (PostGIS), serializable transaction locking (Ledger mutations).
- **Target Size (Stage 3):** 4 vCPUs / 16 GB RAM.
- **Connection Pool:** Minimum 150-200 connection limit configured via PgBouncer.
- **Autoscaling Trigger:** CPU utilization > 70% or average query latency > 50ms.

### 2. Redis (Cache, Pub/Sub, Queues)
**Load characteristics:** BullMQ queue storage, SSE replay streams, geohash caching.
- **Memory Requirements:** Minimum 1 GB RAM allocated. Replay streams capped via `MAXLEN` to prevent unbounded memory growth.
- **Autoscaling Trigger:** Memory utilization > 80% (Evictions happening on non-volatile keys).

### 3. API Servers (Node.js)
**Load characteristics:** High concurrency, sustained open connections (SSE).
- **Requirement:** 1 replica per 1,000 concurrent SSE connections.
- **Target Size (Stage 3):** 5 Replicas (minimum 1 vCPU / 1 GB RAM each).
- **Autoscaling Trigger:** Event Loop Lag > 50ms or CPU > 60%.

---

## Expected Costs (Monthly Estimates)
*Based on standard AWS/GCP pricing tiers*

- **PostgreSQL Database:** ~$150 - $250
- **Managed Redis:** ~$50 - $100
- **API Compute (5 instances):** ~$100 - $150
- **Egress Bandwidth:** ~$20 (SSE is highly optimized for payload size)
- **Total Estimated Base Cost:** **~$320 - $520 / month** at full target scale.

---

## Recommended Alerts
1. **Event Loop Lag:** Alert if average lag exceeds 100ms.
2. **DB Connections:** Alert if active connections exceed 80% of pool size.
3. **Queue Stalls:** Alert if active workers process 0 jobs for > 5 minutes while queue > 0.
