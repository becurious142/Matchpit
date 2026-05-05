# MATCHPIT — Premium Sports Turf Booking + Hosted Match Marketplace

## Overview

Full-stack production-grade app for India (Jaipur-first). pnpm monorepo with TypeScript throughout.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (dark theme, lime-green brand)
- **Auth**: Clerk (via `@clerk/react` + `@clerk/express`)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (15 tables)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API contract**: OpenAPI 3.1 spec → Orval codegen (React Query hooks + Zod schemas)
- **Payments**: Razorpay (dev-mode mock when keys not set)
- **Build**: esbuild (ESM bundle for API server)
- **Logging**: pino (`req.log` in routes, `logger` singleton elsewhere — never `console.log`)

## Artifacts

| Artifact | Dir | Port | Preview Path |
|---|---|---|---|
| API Server | `artifacts/api-server` | 8080 | `/api` |
| MATCHPIT web | `artifacts/matchpit` | env PORT | `/` |

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages (libs → artifacts → scripts)
- `pnpm run typecheck:libs` — build composite libs (run before api-server typecheck)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run qa` — run 162-check data integrity QA suite
- `pnpm --filter @workspace/scripts run seed` — seed 15 Jaipur venues + cities + slots
- `pnpm --filter @workspace/scripts run migrate:sports` — migrate old sport slugs to canonical

## Architecture

```
artifacts/
  api-server/         Express API, all routes in src/routes/
  matchpit/           React+Vite frontend, 14+ pages
lib/
  db/                 Drizzle schema (15 tables), composite lib
  api-spec/           OpenAPI 3.1 YAML + Orval config
  api-client-react/   Generated React Query hooks + Zod schemas
scripts/
  seed.ts             Seeds 15 Jaipur venues + 5 cities + 3080 slots
  migrate-sports.ts   Migrates old sport slugs to canonical 5-sport taxonomy
  qa.ts               162-check data integrity suite
```

## Database Schema (19 tables)

- `profiles` — user profiles (linked to Clerk, +referralCode, +referredBy, +isSuspended, +walletAutoUse)
- `venues` — turf venues (approved/featured flags, +cityId FK, +ownerUserId)
- `slots` — time slots per venue (available/booked/blocked)
- `bookings` — private turf bookings
- `hosted_matches` — social match listings (+cityId FK)
- `hosted_match_participants` — match joiners
- `payments` — Razorpay payment records (idempotent on razorpayOrderId)
- `wallet_transactions` — credits/debits
- `notifications` — in-app notifications
- `owner_leads` — venue owner enquiries (+demo status, +contactedOn, +followupDate, +notes, +assignedAdmin, +expectedInventoryValue)
- `reviews` — venue reviews
- `city_master` — city launch controls (isActive, launchPriority)
- `coupons` — discount codes (flat/percent, expiry, usage limits, first-booking flag)
- `venue_payout_ledger` — per-booking venue commission tracking (pending/paid/hold)
- `wallet_ledger` — wallet credit/debit ledger

## Sports Taxonomy (canonical 5)

Defined in `lib/db/src/constants/sports.ts`. All venues/bookings/matches use these slugs only.

| Slug | Label | Icon |
|---|---|---|
| `cricket` | Cricket | 🏏 |
| `box_cricket` | Box Cricket | 📦 |
| `football` | Football | ⚽ |
| `badminton` | Badminton | 🏸 |
| `pickleball` | Pickleball | 🏓 |

## Backend Routes (all mounted in src/routes/index.ts)

### Public
- `GET /api/cities` — list active cities (from city_master)
- `POST /api/coupons/validate` — validate coupon code + compute discount (auth required)
- `/api/profile` — onboarding, profile CRUD
- `/api/venues` — list, filter, featured, sports, slots
- `/api/bookings` — create (transactional slot lock), list, get, cancel
- `/api/hosted-matches` — create, list, get, join, participants, final-payment
- `/api/payments` — create-order, verify (idempotent), history
- `/api/notifications` — list, mark-read
- `/api/wallet` — balance, transactions
- `/api/dashboard` — aggregated user stats
- `/api/owner-leads` — submit lead form (public)

### Admin (requireAdmin guard)
- `/api/admin` — venues approval/reject/featured, stats, users, owner-leads status
- `GET/POST/PATCH /api/admin/cities` — city launch controls
- `GET /api/admin/finance` — GMV, commissions, payout summary
- `GET /api/admin/payouts` — venue payout ledger
- `PATCH /api/admin/payouts/:id/status` — mark paid/hold
- `GET/POST/PATCH /api/admin/coupons` — coupon CRUD
- `POST /api/admin/wallet/adjust` — credit/debit user wallet
- `PATCH /api/admin/owner-leads/:id/crm` — CRM field update (contactedOn, followup, notes, etc.)

## Frontend Pages (14)

- `/` — Home (hero, featured venues, featured matches, sport filter)
- `/venues` — Venue browser (search, city filter from API, 5-sport filter)
- `/venues/:id` — Venue detail (slots calendar, hosted matches)
- `/book/:venueId/:slotId` — Checkout (Razorpay 3-step flow)
- `/matches` — Hosted match browser (sport/city/skill filters)
- `/matches/:id` — Match detail (squad grid, join + pay flow)
- `/host` — Host a match form
- `/dashboard` — User stats overview
- `/dashboard/bookings` — My bookings
- `/dashboard/matches` — My matches (hosted + joined)
- `/wallet` — Wallet balance + transactions
- `/profile` — Profile editor (correct 5-sport picker, referral code display)
- `/admin` — Admin panel (6 tabs: Venues, Owner CRM, Users, Cities, Finance, Coupons)
- `/sign-in`, `/sign-up` — Clerk auth pages

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session secret |
| `CLERK_SECRET_KEY` | Yes | Clerk backend key |
| `CLERK_PUBLISHABLE_KEY` | Yes | Set as `VITE_CLERK_PUBLISHABLE_KEY` for frontend |
| `RAZORPAY_KEY_ID` | No | Falls back to dev mock if absent |
| `RAZORPAY_KEY_SECRET` | No | Falls back to dev mock if absent |
| `VITE_RAZORPAY_KEY_ID` | No | Frontend Razorpay key |

## Critical Implementation Notes

- **Payment flow (booking/host)**: createOrder → Razorpay checkout → verifyPayment (idempotent: UPDATE existing pending record on razorpayOrderId) → action (createBooking / joinMatch)
- **Payment flow (final match)**: `POST /hosted-matches/:matchId/final-payment` creates match-specific Razorpay order → Razorpay checkout → verifyPayment (auto-updates participant to "final_paid")
- **Payments verify**: UPDATES existing pending payment record rather than inserting duplicates; falls through to INSERT only for dev-bypass flows
- **Slot booking**: wrapped in a DB transaction to prevent double-booking race conditions
- **Match join**: checks existing participant before insert; player count updated atomically
- **City master**: `GET /api/cities` returns only active cities. Frontend venues page fetches active cities for its city filter. Admin Cities tab controls isActive flag. Only Jaipur is active at launch.
- **Coupon validation**: POST /coupons/validate checks active, not expired, max-uses, min-amount, city/sport scope, first-booking-only — returns discount amount + finalAmount
- **Sports taxonomy**: `SPORTS` constant + `getSportMeta(slug) → Sport | null` in `lib/db/src/constants/sports.ts`. All venues migrated to canonical slugs.
- **Venue payout ledger**: Created per booking/match with grossAmount, razorpayFee, platformCommission, venuePayable. Status: pending → paid/hold.
- **Admin guard**: `requireAdmin()` helper reads profile from DB, returns 403 if not admin
- **Admin wallet adjust**: Updates profilesTable.walletBalance + inserts to walletLedgerTable atomically in a transaction
- **Owner leads CRM**: Extended with contactedOn, followupDate, notes, assignedAdmin, expectedInventoryValue. Status now includes "demo".
- **scripts/qa.ts**: 61-check data integrity suite; run with `pnpm --filter @workspace/scripts run qa`
- **lib/db is composite**: run `pnpm run typecheck:libs` before api-server typecheck

## Seeded Data

15 Jaipur venues (all canonical sports), 5 cities (Jaipur active, 4 inactive), 3080 slots (14 days × 11 slots × ~20 venues), 3 sample owner leads (new/contacted/demo statuses).
