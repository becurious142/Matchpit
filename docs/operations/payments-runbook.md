# Payments Runbook — Matchpit Hosted Match Economy

**Last Updated:** 2026-05-11  
**Applies To:** Production payment operations  
**Oncall Severity Guide:** CRITICAL = wake someone up now | HIGH = fix within 2h | MEDIUM = fix same day

---

## Scenario 1: Payment Stuck in Pending

**Symptoms:**
- User reports "payment was deducted but match not showing confirmed"
- `GET /admin/payments/reconcile-pending` shows the payment

**Diagnosis:**
```sql
-- Find stale pending payments (>30 min)
SELECT id, user_id, type, razorpay_order_id, amount, created_at,
       EXTRACT(EPOCH FROM (NOW() - created_at))/60 AS age_minutes
FROM payments
WHERE status IN ('pending', 'payment_initiated')
  AND created_at < NOW() - INTERVAL '30 minutes'
ORDER BY created_at ASC;
```

**Resolution:**

1. **Check Razorpay dashboard** for the `razorpay_order_id` — confirm capture status.
2. **If captured in Razorpay but not in DB:**
   - The webhook may have been missed.
   - Use the verify fallback endpoint (triggered manually by admin):
   ```bash
   # Trigger verify for the specific payment order
   POST /payments/verify
   Body: { "razorpayOrderId": "<order_id>", "razorpayPaymentId": "<payment_id>", "razorpaySignature": "<sig>" }
   ```
3. **If not captured in Razorpay:**
   - Mark payment as expired (safe — no money moved):
   ```sql
   UPDATE payments SET status = 'expired', updated_at = NOW()
   WHERE id = '<payment_id>' AND status IN ('pending','payment_initiated');
   ```
4. **Notify user** that the payment session expired and prompt to retry.

**Prevention:** Reservation timeout cron (`releaseExpiredReservations`) should clean up unpaid reservations every 5 minutes.

---

## Scenario 2: Missing Webhook

**Symptoms:**
- Payment captured in Razorpay (verified via dashboard)
- `payment_webhook_events` has no row for the order ID

**Diagnosis:**
```sql
-- Check webhook event log for the order
SELECT * FROM payment_webhook_events
WHERE payload::text LIKE '%<razorpay_order_id>%'
ORDER BY created_at DESC LIMIT 5;
```

**Resolution:**

1. **If Razorpay shows captured** and no webhook row exists:
   - The webhook was never delivered (Razorpay network issue).
   - Use the **verify fallback** endpoint above — this runs all side effects.
2. **If webhook exists but `processing_status = 'failed'`:**
   - Check `payload` column for error context.
   - Re-trigger via admin cron:
   ```bash
   POST /admin/cron/reconcile-match-payments
   ```
3. **If webhook exists and `processing_status = 'processed'`:**
   - Side effects ran. Check if participant row exists.
   - If participant missing: investigate `convertReservationToParticipant` logs.

**Escalation:** If >3 webhooks missing for the same venue/day, escalate to Razorpay support.

---

## Scenario 3: Duplicate Webhook

**Symptoms:**
- Payment row shows success but appears to have been processed twice
- Multiple payout rows for same `paymentId`

**Diagnosis:**
```sql
-- Check retry count
SELECT provider_event_id, processing_status, retry_count, created_at, processed_at
FROM payment_webhook_events
WHERE provider_event_id LIKE '%<order_id>%';

-- Check for duplicate payouts
SELECT payment_id, payout_type, COUNT(*) 
FROM venue_payout_ledger
WHERE payment_id = '<payment_id>'
GROUP BY payment_id, payout_type
HAVING COUNT(*) > 1;
```

**Resolution:**

- If `retry_count > 0` and `processing_status = 'processed'` → **idempotency guard worked correctly**. No action needed.
- If duplicate payout rows exist (idempotency failed):
  ```sql
  -- Find duplicates (keep the first one)
  SELECT id FROM venue_payout_ledger
  WHERE payment_id = '<payment_id>' AND payout_type = '<type>'
  ORDER BY created_at ASC
  OFFSET 1;
  
  -- Create reversal for duplicate (DO NOT DELETE — audit trail)
  INSERT INTO venue_payout_ledger (venue_id, reference_id, reference_type, gross_amount, 
    razorpay_fee, platform_commission, venue_payable, status, payout_type, notes)
  SELECT venue_id, reference_id, reference_type, -gross_amount,
    -razorpay_fee, -platform_commission, -venue_payable, 'hold', 'reversal',
    'REVERSAL: duplicate webhook payout correction'
  FROM venue_payout_ledger WHERE id = '<duplicate_id>';
  ```

---

## Scenario 4: Refund Required

**Symptoms:**
- Payment `review_status = 'refund_required'`
- User paid but received no value (e.g., late webhook on expired reservation)

**Diagnosis:**
```sql
SELECT p.id, p.user_id, p.type, p.amount, p.razorpay_payment_id,
       p.review_status, p.created_at,
       rr.report_type, rr.payload
FROM payments p
LEFT JOIN reconciliation_reports rr ON rr.entity_id = p.id
WHERE p.review_status = 'refund_required'
ORDER BY p.created_at DESC;
```

**Resolution:**

1. **Confirm the Razorpay payment ID** from the payment row.
2. **Issue Razorpay refund** via dashboard or API for that payment ID.
3. **Credit user wallet** (if refund is via wallet instead of Razorpay):
   ```bash
   POST /admin/wallet/adjust
   Body: {
     "userId": "<user_id>",
     "type": "credit",
     "amount": <amount_in_inr>,
     "reason": "Refund for payment <payment_id> — late webhook on expired reservation"
   }
   ```
4. **Mark payment resolved:**
   ```sql
   UPDATE payments 
   SET review_status = 'refunded', updated_at = NOW()
   WHERE id = '<payment_id>';
   
   UPDATE reconciliation_reports
   SET resolved = true, resolution_notes = 'Refunded via wallet credit <date>', resolved_at = NOW()
   WHERE entity_id = '<payment_id>';
   ```
5. **Notify user** that their refund has been processed.

**SLA:** All `refund_required` payments must be resolved within 24 hours.

---

## Monitoring Queries

```sql
-- Live refund queue
SELECT COUNT(*) FROM payments WHERE review_status = 'refund_required';

-- Webhook health (last 1h)
SELECT processing_status, COUNT(*) 
FROM payment_webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY processing_status;

-- All pending review items
SELECT type, review_status, COUNT(*), SUM(amount)
FROM payments
WHERE review_status != 'none'
GROUP BY type, review_status;
```
