# Settlements Runbook — Matchpit Hosted Match Economy

**Last Updated:** 2026-05-11  
**Applies To:** Venue payout settlement operations  
**Key Principle:** Settlement rows are IMMUTABLE once batched. Never update `grossAmount`, `venueId`, or `settlementBatchId` on existing rows. Create additive reversals instead.

---

## Settlement Lifecycle

```
pending
  ↓ (completion cron)
ready_for_settlement
  ↓ (POST /admin/payouts/settle-venue)
paid  [settlementBatchId assigned, paidAt set]
  ↓ (if error discovered)
REVERSAL row added (status=hold, negative amounts)
```

---

## Scenario 1: Creating a Settlement Batch

**When:** Match is completed (>3h past end time) and payout rows are `ready_for_settlement`.

**Step 1: Verify payout rows are ready**
```sql
SELECT venue_id, COUNT(*) as rows, SUM(venue_payable) as total_payable
FROM venue_payout_ledger
WHERE status = 'ready_for_settlement'
GROUP BY venue_id
ORDER BY total_payable DESC;
```

**Step 2: Trigger settlement for a specific venue**
```bash
POST /admin/payouts/settle-venue
Body: {
  "venueId": "<venue_uuid>",
  "notes": "Settlement for week of 2026-05-11"
}
```

Response includes `batchId`, `settledCount`, `totalAmount`.

**Step 3: Confirm batch**
```sql
SELECT settlement_batch_id, COUNT(*), SUM(venue_payable), MIN(paid_at), MAX(paid_at)
FROM venue_payout_ledger
WHERE settlement_batch_id = '<batch_id>'
GROUP BY settlement_batch_id;
```

---

## Scenario 2: CSV Export for Bank Transfer

**Export a settlement batch to CSV for sending to finance:**

```sql
-- Paste this into your Postgres client and export as CSV
SELECT 
  vpl.id AS payout_id,
  v.name AS venue_name,
  v.contact_phone,
  vpl.settlement_batch_id,
  vpl.reference_type,
  vpl.payout_type,
  vpl.gross_amount,
  vpl.razorpay_fee,
  vpl.platform_commission,
  vpl.venue_payable,
  vpl.paid_at,
  vpl.notes
FROM venue_payout_ledger vpl
JOIN venues v ON v.id = vpl.venue_id
WHERE vpl.settlement_batch_id = '<batch_id>'
ORDER BY vpl.created_at ASC;
```

**Or use the admin API:**
```bash
GET /admin/payouts?batchId=<batch_id>
```

---

## Scenario 3: Marking a Batch as Paid

After bank transfer is confirmed:

**Individual row (use sparingly):**
```bash
PATCH /admin/payouts/<payout_id>/status
Body: { "status": "paid", "notes": "NEFT ref: <bank_ref_id>" }
```

**Batch via SQL (preferred for large batches):**
```sql
UPDATE venue_payout_ledger
SET status = 'paid', paid_at = NOW(), notes = 'NEFT batch <bank_ref_id>'
WHERE settlement_batch_id = '<batch_id>'
  AND status IN ('pending', 'ready_for_settlement');
```

> [!WARNING]
> Do NOT update rows that already have `status = 'paid'` — those are already finalized.

---

## Scenario 4: Reversal Handling

**When:** A settled payout was incorrect (wrong amount, wrong venue, duplicated).

**NEVER** update the original paid row. Always create a new reversal row.

**Step 1: Verify the original payout**
```sql
SELECT id, venue_id, gross_amount, venue_payable, status, settlement_batch_id, notes
FROM venue_payout_ledger
WHERE id = '<payout_id>';
```

**Step 2: Create reversal via the library (preferred)**

The `reverseMatchPayouts(matchId)` function in `src/lib/payouts.ts` handles this automatically for match-level reversals. It:
- Creates equal and opposite rows
- Sets `status = 'hold'` on reversal rows
- Marks `notes = 'REVERSAL of payout <id>'`

**Step 3: Manual SQL reversal (individual row)**
```sql
INSERT INTO venue_payout_ledger 
  (venue_id, reference_id, reference_type, gross_amount, razorpay_fee, 
   platform_commission, venue_payable, status, payout_type, notes)
SELECT 
  venue_id, reference_id, reference_type,
  -gross_amount, -razorpay_fee, -platform_commission, -venue_payable,
  'hold', 'reversal',
  'REVERSAL of payout ' || id || ' — <reason>'
FROM venue_payout_ledger
WHERE id = '<original_payout_id>';
```

**Step 4: Verify net is zero**
```sql
SELECT SUM(venue_payable) AS net
FROM venue_payout_ledger
WHERE reference_id = '<match_id>';
-- Should be 0 or very close to 0
```

---

## Balance Reconciliation

**Monthly check — does payout ledger match platform revenue ledger?**
```sql
-- Venue payout total
SELECT SUM(venue_payable) AS total_to_venues FROM venue_payout_ledger WHERE status = 'paid';

-- Platform revenue total
SELECT SUM(net_revenue) AS platform_net FROM platform_revenue_ledger;

-- These should sum to total gross collected:
SELECT SUM(amount) FROM payments WHERE status IN ('verified','success','payment_captured');
```

---

## Monitoring Queries

```sql
-- Batches older than 24h still processing
SELECT settlement_batch_id, COUNT(*), MIN(created_at)
FROM venue_payout_ledger
WHERE status = 'processing'
GROUP BY settlement_batch_id
HAVING MIN(created_at) < NOW() - INTERVAL '24 hours';

-- Pending payout exposure by venue
SELECT v.name, SUM(vpl.venue_payable) AS pending_payable
FROM venue_payout_ledger vpl
JOIN venues v ON v.id = vpl.venue_id
WHERE vpl.status IN ('pending','ready_for_settlement')
GROUP BY v.name
ORDER BY pending_payable DESC;
```
