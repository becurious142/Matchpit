# Incident Response Runbook — Matchpit Hosted Match Economy

**Last Updated:** 2026-05-11  
**Contact:** Ops on-call → Engineering Lead → CTO  
**Incident Log:** Document all actions with timestamps in the incident Slack thread.

---

## Severity Definitions

| Severity | Criteria | Response Time |
|---|---|---|
| SEV-1 | Live money at risk, payments failing for all users | Immediate, 24/7 |
| SEV-2 | Partial payment failures, settlement blocked, data inconsistency | Within 30 min |
| SEV-3 | Degraded UX, non-critical feature broken | Business hours |

---

## Incident Response Framework

**For every incident:**
1. Declare incident in Slack `#incidents`
2. Open Incident Commander role (first responder owns it)
3. Run diagnosis queries below
4. Take action
5. Document what changed and when
6. Post-mortem within 48h

---

## Scenario 1: Payment Outage (All Payments Failing)

**Symptoms:** Users unable to pay, 500 errors on `/payments/create` or `/payments/verify`.

**Immediate Actions:**

1. **Check server health:**
   ```bash
   GET /health
   ```
   If unhealthy: restart API server instance.

2. **Check DB connectivity:**
   ```bash
   # From server shell
   psql $DATABASE_URL -c "SELECT 1"
   ```

3. **Check Razorpay API status:** https://status.razorpay.com

4. **Check recent error logs:**
   ```bash
   # Grep for payment creation errors in the last 10 min
   journalctl -u matchpit-api --since "10 min ago" | grep "payment"
   ```

5. **Disable new match creation (if needed — prevents new payment obligations):**
   - Update env var: `FEATURE_MATCHES_DISABLED=true` and restart
   - OR: Add DB feature flag to return 503 from `/hosted-matches` POST

6. **Customer comms:** Post on app: "We're experiencing a temporary payment issue. Your money is safe. We're fixing it now."

**Post-Recovery:**
- Run reconciliation cron: `POST /admin/cron/reconcile-match-payments`
- Check for stale pending payments: `GET /admin/payments/reconcile-pending`
- Verify no orphan payments: Check `reconciliation_reports` for new CRITICAL anomalies

---

## Scenario 2: Razorpay Outage

**Symptoms:** `POST /payments/create` fails with Razorpay API errors. Webhooks stopped arriving.

**Immediate Actions:**

1. **Verify Razorpay status:** https://status.razorpay.com

2. **Do NOT mark Razorpay-pending payments as failed** — they may complete when Razorpay recovers.

3. **Monitor webhook backlog:** Razorpay will retry failed webhook deliveries for up to 24h.
   ```sql
   -- Watch for webhook arrivals recovering
   SELECT COUNT(*), MAX(created_at) FROM payment_webhook_events
   WHERE created_at > NOW() - INTERVAL '30 minutes';
   ```

4. **Freeze new orders** until Razorpay is stable (prevents partial-state orders).

5. **For payments that were "captured" in Razorpay UI but webhook never arrived:**
   After Razorpay recovers, use the verify endpoint:
   ```bash
   POST /payments/verify  
   Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
   ```

6. **SLA Check:** After 4h of outage, run reconciliation:
   ```bash
   POST /admin/cron/reconcile-match-payments
   ```
   Review all new `stale_pending_payment` reports.

---

## Scenario 3: Database Outage

**Symptoms:** API returns 500 for all endpoints. DB connection pool exhausted.

**Immediate Actions:**

1. **Check Neon/DB status** (if using Neon): https://neonstatus.com

2. **Connection pool check:**
   ```bash
   # Check active connections
   psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   ```
   If maxed: restart API server to release connections.

3. **Read replica fallback** (if configured):
   - Update `DATABASE_URL` to point to read replica for GET endpoints
   - Disable all mutation endpoints until primary recovers

4. **DO NOT trigger new cron jobs during DB outage** — they will fail and may produce partial state.

5. **Data integrity check post-recovery:**
   ```sql
   -- Check for rows with inconsistent timestamps (partial writes)
   SELECT COUNT(*) FROM payments WHERE created_at > updated_at;
   SELECT COUNT(*) FROM hosted_matches WHERE created_at > updated_at;
   ```

6. **Run full reconciliation after recovery:**
   ```bash
   POST /admin/cron/reconcile-match-payments
   ```

---

## Scenario 4: Incorrect Payout Discovered

**Symptoms:** Venue complains about wrong payout amount. Finance spots a mismatch.

**Immediate Actions:**

1. **Freeze the batch** (prevent additional settlement of affected venue):
   ```sql
   -- Block further settlements for venue
   UPDATE venue_payout_ledger
   SET status = 'hold'
   WHERE venue_id = '<venue_id>' AND status IN ('pending','ready_for_settlement');
   ```

2. **Identify the incorrect rows:**
   ```sql
   SELECT id, reference_id, payout_type, gross_amount, venue_payable, 
          status, settlement_batch_id, created_at, notes
   FROM venue_payout_ledger
   WHERE venue_id = '<venue_id>'
   ORDER BY created_at DESC LIMIT 20;
   ```

3. **Calculate the delta:**
   ```sql
   -- What was paid vs what should have been paid
   SELECT SUM(venue_payable) AS paid, <expected_amount> AS expected,
          SUM(venue_payable) - <expected_amount> AS delta
   FROM venue_payout_ledger
   WHERE settlement_batch_id = '<batch_id>';
   ```

4. **Create a correction row:**
   - If overpaid → create a negative reversal row
   - If underpaid → create a positive adjustment row
   ```sql
   INSERT INTO venue_payout_ledger 
     (venue_id, reference_id, reference_type, gross_amount, razorpay_fee,
      platform_commission, venue_payable, status, payout_type, notes)
   VALUES (
     '<venue_id>', '<reference_id>', 'adjustment', 
     <delta_gross>, 0, 0, <delta_payable>,
     'pending', NULL,
     'CORRECTION: payout adjustment for batch <batch_id>. Reason: <reason>. Authorized by: <name>'
   );
   ```

5. **Notify venue** with corrected amount and expected next settlement date.

6. **Document in reconciliation:**
   ```sql
   INSERT INTO reconciliation_reports (report_type, severity, entity_type, entity_id, source_system, payload)
   VALUES (
     'capture_mismatch', 'high', 'payout', '<payout_id>', 'manual_correction',
     '{"batchId":"<batch_id>","delta":<delta>,"reason":"<reason>","correctedBy":"<name>"}'::jsonb
   );
   ```

---

## Post-Incident Checklist

After every SEV-1 or SEV-2 incident:

- [ ] Root cause identified
- [ ] Affected users notified
- [ ] Financial exposure calculated and documented
- [ ] Reconciliation cron run and anomalies resolved
- [ ] Payout ledger verified to balance
- [ ] Monitoring alert thresholds reviewed
- [ ] Post-mortem written and shared
- [ ] Preventive action item created in backlog
