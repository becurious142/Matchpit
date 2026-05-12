# Launch Checklist — Matchpit Hosted Match Economy

**Version:** HM11 Production Readiness  
**Signed Off By:** _________________________  
**Launch Date:** _________________________

---

## Go/No-Go Launch Criteria

> [!CAUTION]
> **ALL items in this list must be checked ✅ before processing live payments.**  
> A single unchecked REQUIRED item is a launch blocker.

---

## 1. Integration Tests

| Check | Owner | Status |
|---|---|---|
| All test suites pass (`pnpm test:coverage`) | Engineering | `[ ]` |
| Line coverage ≥ 90% for `src/lib/payouts.ts` | Engineering | `[ ]` |
| Line coverage ≥ 90% for `src/lib/post-payment.ts` | Engineering | `[ ]` |
| Line coverage ≥ 90% for `src/lib/match-cron.ts` | Engineering | `[ ]` |
| Abuse protection tests pass (unique constraints) | Engineering | `[ ]` |
| Concurrent reservation test confirms exactly 1 winner | Engineering | `[ ]` |

---

## 2. Payment System

| Check | Owner | Status |
|---|---|---|
| `RAZORPAY_WEBHOOK_SECRET` configured in production | DevOps | `[ ]` |
| Webhook endpoint is reachable by Razorpay IPs | DevOps | `[ ]` |
| Verify fallback endpoint tested with real Razorpay payment | Engineering | `[ ]` |
| Duplicate webhook delivered and idempotency confirmed | Engineering | `[ ]` |
| Late webhook → `refund_required` path verified on staging | Engineering | `[ ]` |
| Zero `refund_required` payments in review queue | Ops | `[ ]` |
| Test payment of ₹1 processed successfully end-to-end | Engineering | `[ ]` |

---

## 3. Reservations & Match Lifecycle

| Check | Owner | Status |
|---|---|---|
| Reservation timeout (7 min) cron running every 5 min | DevOps | `[ ]` |
| Underfill cron running (daily, before 00:30) | DevOps | `[ ]` |
| Completion cron running (every 30 min) | DevOps | `[ ]` |
| `open → confirmed` transition verified on staging | Engineering | `[ ]` |
| `confirmed → fully_paid` transition verified on staging | Engineering | `[ ]` |
| `fully_paid → completed` transition verified on staging | Engineering | `[ ]` |

---

## 4. Reconciliation & Financial Integrity

| Check | Owner | Status |
|---|---|---|
| Reconciliation cron scheduled (daily, 02:00) | DevOps | `[ ]` |
| Zero unresolved anomalies in `reconciliation_reports` | Finance/Ops | `[ ]` |
| Orphan payment checks (Class A) verified on staging | Engineering | `[ ]` |
| Orphan reservation checks (Class B) verified on staging | Engineering | `[ ]` |
| Payout ledger balances to zero for all cancelled matches | Finance | `[ ]` |

---

## 5. Settlements

| Check | Owner | Status |
|---|---|---|
| No stuck settlement batches (`processing` status > 24h) | Ops | `[ ]` |
| Settlement batch creation tested on staging | Engineering | `[ ]` |
| CSV export verified for a test batch | Finance | `[ ]` |
| Reversal flow tested (negative row nets to zero) | Engineering | `[ ]` |

---

## 6. Monitoring

| Check | Owner | Status |
|---|---|---|
| `GET /admin/monitoring/health` returns `HEALTHY` | Engineering | `[ ]` |
| `GET /admin/monitoring/metrics` returns 7-day series | Engineering | `[ ]` |
| `GET /admin/finance/dashboard` returns all 4 sections | Engineering | `[ ]` |
| Alert thresholds reviewed and agreed by ops team | Ops | `[ ]` |

---

## 7. Data Backfills

| Check | Owner | Status |
|---|---|---|
| `backfill-wallet-ledger-bootstrap.ts` dry-run completed | Engineering | `[ ]` |
| `backfill-wallet-ledger-bootstrap.ts --execute` applied | Engineering | `[ ]` |
| `backfill-payment-components.ts` dry-run completed | Engineering | `[ ]` |
| `backfill-payment-components.ts --execute` applied | Engineering | `[ ]` |
| `backfill-settlement-batch-ids.ts` dry-run completed | Engineering | `[ ]` |
| `backfill-settlement-batch-ids.ts --execute` applied | Engineering | `[ ]` |
| Backfill audit outputs saved and reviewed | Finance/Engineering | `[ ]` |

---

## 8. Load Testing

| Check | Owner | Status |
|---|---|---|
| Concurrent reservation test (100 parallel) ≥95% correct | Engineering | `[ ]` |
| Duplicate webhook flood (50 parallel) → exactly 1 processed | Engineering | `[ ]` |
| Settlement batch of 1000 rows < 5s | Engineering | `[ ]` |
| Reconciliation scan completes < 30s | Engineering | `[ ]` |

---

## 9. Staging Smoke Test

| Check | Owner | Status |
|---|---|---|
| `smoke-production-readiness.ts` all 12 steps PASS | Engineering | `[ ]` |
| Smoke test run against production-equivalent environment | Engineering | `[ ]` |
| Zero exit code confirmed (`echo $?`) | Engineering | `[ ]` |

---

## 10. Runbooks

| Check | Owner | Status |
|---|---|---|
| `payments-runbook.md` reviewed by ops team | Ops | `[ ]` |
| `settlements-runbook.md` reviewed by finance team | Finance | `[ ]` |
| `reconciliation-runbook.md` reviewed by ops team | Ops | `[ ]` |
| `incident-response.md` reviewed by engineering + ops | Engineering/Ops | `[ ]` |
| On-call escalation contacts documented | Ops | `[ ]` |

---

## 11. Infrastructure

| Check | Owner | Status |
|---|---|---|
| Production DB connection pool configured (min=5, max=20) | DevOps | `[ ]` |
| DB point-in-time recovery enabled | DevOps | `[ ]` |
| Structured logs (pino) shipping to log aggregator | DevOps | `[ ]` |
| Error rate alerting configured (PagerDuty / Slack) | DevOps | `[ ]` |
| Razorpay webhook delivery monitoring enabled | Ops | `[ ]` |

---

## Final Sign-Off

```
Engineering Lead:    ___________________________  Date: __________
Finance Lead:        ___________________________  Date: __________
Operations Lead:     ___________________________  Date: __________
Product Owner:       ___________________________  Date: __________
```

**Launch authorized:** `[ ] YES` / `[ ] NO`

---

## Post-Launch Monitoring (First 72h)

Run every 4 hours for the first 3 days:
```bash
# Health check
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.matchpit.in/admin/monitoring/health

# Smoke test
ADMIN_TOKEN=$ADMIN_TOKEN API_BASE_URL=https://api.matchpit.in npx tsx scripts/smoke-production-readiness.ts
```

**Escalation if health = CRITICAL:** Wake on-call engineer immediately.
