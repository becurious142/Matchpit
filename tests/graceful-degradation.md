# Graceful Degradation Strategies

Matchpit implements graceful degradation to ensure core functionality remains accessible during partial system outages.

## 1. Redis Failure (Locking / Caching)
- **Impact**: Distributed locks (bookings, joining matches) fail.
- **Strategy**: 
  - `DistributedLockService` throws `LockAcquisitionError`.
  - API returns `409 Conflict` advising users to try again, preventing overbooking.
  - Read-heavy endpoints bypass cache and fall back to Postgres read replicas (if configured).

## 2. Worker Queue (BullMQ) Outage
- **Impact**: Notifications, payouts, and scheduled tasks are delayed.
- **Strategy**:
  - The API synchronously records the intent in the database (e.g. state machine status `payment_pending`).
  - Webhooks acknowledge the provider immediately (`200 OK`).
  - When Redis/Workers return, delayed jobs are picked up automatically. Dead Letter Replays handle any dropped tasks.

## 3. Razorpay Outage
- **Impact**: New checkout sessions cannot be created.
- **Strategy**:
  - Use Wallet balances seamlessly.
  - Show "Payment Gateway Unavailable" rather than generic 500 errors.

## 4. Database High Latency / Connection Limit
- **Impact**: Slow queries, connection timeouts.
- **Strategy**:
  - `pino-http` logs request durations.
  - Critical endpoints (checkout/bookings) have strict query timeouts.
  - Read-heavy endpoints (search/discovery) serve stale cache data if DB read times out.
