# Reconciliation Runbook — Matchpit Hosted Match Economy

**Last Updated:** 2026-05-11  
**Applies To:** Financial reconciliation operations  
**Key Principle:** Reconciliation is read-only detection. It NEVER mutates money. Repairs require explicit admin action documented in this runbook.

---

## Anomaly Classes Reference

| Class | Report Type | Severity | Description |
|---|---|---|---|
| A | `orphan_payment_no_reservation` | CRITICAL | Captured payment, no reservation row linked |
| B | `orphan_reservation_no_participant` | CRITICAL | Reservation converted, no participant ID |
| C | `orphan_participant_no_payout` | HIGH | Participant paid, no payout ledger row |
| D | `orphan_payout_no_payment` | HIGH | Payout row exists, no linked payment |
| E | `refund_without_reversal` | HIGH | Refund processed, no reversal payout row |
| F | `capture_mismatch` | HIGH | Payout amount doesn't match payment amount |
| G | `duplicate_webhook_attempt` | MEDIUM | Replay detected and blocked |
| H | `settlement_batch_failure` | HIGH | Batch settlement processing error |
| I | `late_webhook_refund_required` | HIGH | Late webhook flagged for manual refund |
| J | `stale_pending_payment` | MEDIUM | Payment pending >60 minutes |

---

## Scenario 1: Investigating Anomalies

**Check the reconciliation queue:**
```sql
-- All unresolved anomalies by severity
SELECT report_type, severity, COUNT(*), MIN(created_at) AS oldest
FROM reconciliation_reports
WHERE resolved = false
GROUP BY report_type, severity
ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END;
```

**Drill into a specific report:**
```sql
SELECT id, report_type, severity, entity_type, entity_id,
       payload, source_system, created_at, resolution_notes
FROM reconciliation_reports
WHERE id = '<report_id>';
```

**Run reconciliation on demand:**
```bash
POST /admin/cron/reconcile-match-payments
```
Returns `{ processed, errors, details[] }`.

---

## Scenario 2: Repairing Orphan Payments (Class A)

**Root cause:** Webhook delivered, payment captured in DB, but reservation row was not linked to the payment ID.

**Diagnosis:**
```sql
SELECT p.id, p.user_id, p.type, p.razorpay_order_id, p.amount,
       hmr.id AS reservation_id
FROM payments p
LEFT JOIN hosted_match_reservations hmr ON hmr.payment_id = p.id
WHERE p.status IN ('verified','payment_captured','success')
  AND p.type IN ('match_reserve','match_final','host_commitment')
  AND hmr.id IS NULL;
```

**Repair — if reservation exists but not linked:**
```sql
-- Step 1: Find the reservation by order_id
SELECT id, reservation_status, is_active
FROM hosted_match_reservations
WHERE payment_order_id = '<razorpay_order_id>';

-- Step 2: Link the payment to the reservation
UPDATE hosted_match_reservations
SET payment_id = '<payment_id>', updated_at = NOW()
WHERE id = '<reservation_id>';

-- Step 3: If reservation was awaiting conversion, trigger conversion via API
POST /admin/cron/reconcile-match-payments
```

**Repair — if no reservation exists (money taken, no value delivered):**
1. Mark payment as `refund_required`
2. Follow the refund runbook

**Mark resolved:**
```sql
UPDATE reconciliation_reports
SET resolved = true,
    resolution_notes = 'Linked payment to reservation <id> on <date>. Verified participant created.',
    resolved_at = NOW()
WHERE id = '<report_id>';
```

---

## Scenario 3: Repairing Orphan Participants (Class C)

**Root cause:** Participant exists and has paid, but no payout ledger row was generated.

**Diagnosis:**
```sql
SELECT hmp.id, hmp.match_id, hmp.user_id, hmp.payment_status,
       hmp.reserve_payment_id, hmp.final_payment_id,
       vpl.id AS payout_id
FROM hosted_match_participants hmp
LEFT JOIN venue_payout_ledger vpl ON vpl.payment_id = hmp.reserve_payment_id
WHERE hmp.payment_status IN ('reserve_paid','final_paid')
  AND vpl.id IS NULL;
```

**Repair — regenerate the missing payout:**
```sql
-- Get match venue and payment details
SELECT hm.venue_id, hmp.reserve_payment_id, hmp.reserve_paid_amount
FROM hosted_match_participants hmp
JOIN hosted_matches hm ON hm.id = hmp.match_id
WHERE hmp.id = '<participant_id>';
```

Then call `generateMatchPayout` via a Node.js script or the admin maintenance endpoint:
```bash
# Example: regenerate payout for specific payment
# (Requires custom admin endpoint or direct script execution)
npx tsx scripts/backfill-payment-components.ts --paymentId=<id>
```

---

## Scenario 4: Resolution Workflow

**All anomalies follow this resolution lifecycle:**

1. **Detect** — Cron writes to `reconciliation_reports` with `resolved = false`
2. **Investigate** — Use the queries above to understand root cause
3. **Repair** — Execute the appropriate fix from this runbook
4. **Verify** — Confirm the repair worked via follow-up queries
5. **Close** — Mark resolved with structured notes:

```sql
UPDATE reconciliation_reports
SET resolved = true,
    resolution_notes = '<YYYY-MM-DD> | Action: <what you did> | Verifier: <your name> | Outcome: <result>',
    resolved_at = NOW()
WHERE id = '<report_id>';
```

**Example resolution note:**
```
2026-05-11 | Action: Regenerated missing payout row for payment abc123, match xyz789.
Verified: venue_payout_ledger row created with venue_payable=431.20.
Verifier: Ravi | Outcome: Resolved — no financial exposure.
```

---

## Monitoring Queries

```sql
-- Daily anomaly trend
SELECT DATE(created_at), report_type, COUNT(*)
FROM reconciliation_reports
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), report_type
ORDER BY DATE(created_at) DESC;

-- Open critical/high anomalies
SELECT id, report_type, severity, entity_id, created_at
FROM reconciliation_reports
WHERE resolved = false AND severity IN ('critical','high')
ORDER BY created_at ASC;

-- Auto-resolved vs manual
SELECT auto_resolved, COUNT(*)
FROM reconciliation_reports
GROUP BY auto_resolved;
```
