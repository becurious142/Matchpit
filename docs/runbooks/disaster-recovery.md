# Disaster Recovery Runbook

This document details the escalation flows and operational procedures for severe system degradation or data loss.

## Level 1: Worker Queue Stall or Poison Loop
**Symptoms:** BullMQ queues are growing, workers are restarting repeatedly, event loop lag is > 200ms.
**Action Plan:**
1. Pause the specific queue via BullBoard or Redis CLI (`redis-cli -u $REDIS_URL PAUSE queueName`).
2. Identify the poison payload via Grafana/Pino logs.
3. Deploy a hotfix to `registry.ts` or the specific worker to handle the payload gracefully.
4. Resume the queue.

## Level 2: Database Primary Failure / Replica Lag
**Symptoms:** Connection timeout errors in API logs, `db-pool-exhaustion` alerts firing, 503 errors on bookings.
**Action Plan:**
1. Check RDS/Supabase dashboard to verify failover status.
2. If the replica is lagging significantly (seen in `geo-discovery` stale results), pause discovery cache refresh jobs in BullMQ.
3. Once the primary is fully promoted, flush the Redis `nearby_venues` and `nearby_matches` caches to force a clean read from the new primary.

## Level 3: Redis Complete Failure (Partition/OOM)
**Symptoms:** SSE clients disconnecting massively, rate limiters failing open/closed, BullMQ throwing `ECONNREFUSED`.
**Action Plan:**
1. MATCHPIT is designed to degrade gracefully. Bookings and payouts will stall but DB transactions remain safe.
2. If Redis OOM'd, scale the Redis instance and restart.
3. Upon Redis restart, execute the `cacheRefreshWorker` manually to rebuild geo-caches.
4. Active SSE clients will automatically execute a reconnect storm; the API server autoscaler should handle the surge.

## Level 4: Complete Data Corruption (The Nuclear Option)
**Symptoms:** `reconciliation-drill` alerting in production, catastrophic ledger drift.
**Action Plan:**
1. **IMMEDIATE:** Take down the API server to stop bleeding (`vercel env pull && vercel down` or equivalent).
2. Execute `tests/disaster-recovery/full-restore.ts` against the staging environment with the latest hourly snapshot.
3. Run `scripts/ledger-integrity-check.ts` against the restored snapshot.
4. If integrity passes, repoint production to the restored DB.
5. Notify all users of a brief maintenance window.
