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
- **Database**: PostgreSQL + Drizzle ORM (11 tables)
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

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run before api-server typecheck)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Architecture

```
artifacts/
  api-server/         Express API, all routes in src/routes/
  matchpit/           React+Vite frontend, 14 pages
lib/
  db/                 Drizzle schema (11 tables), composite lib
  api-spec/           OpenAPI 3.1 YAML + Orval config
  api-client-react/   Generated React Query hooks + Zod schemas
scripts/
  seed.ts             Seeds 5 venues + 770 slots (14 days × 11 slots × 5 venues)
```

## Database Schema (11 tables)

- `profiles` — user profiles (linked to Clerk)
- `venues` — turf venues (approved/featured flags)
- `slots` — time slots per venue (available/booked/blocked)
- `bookings` — private turf bookings
- `hosted_matches` — social match listings
- `hosted_match_participants` — match joiners
- `payments` — Razorpay payment records (idempotent on razorpayOrderId)
- `wallet_transactions` — credits/debits
- `notifications` — in-app notifications
- `owner_leads` — venue owner enquiries
- `reviews` — venue reviews

## Backend Routes (all mounted in src/routes/index.ts)

- `/api/profile` — onboarding, profile CRUD
- `/api/venues` — list, filter, featured, sports, slots
- `/api/bookings` — create (transactional slot lock), list, get, cancel
- `/api/hosted-matches` — create, list, get, join, participants, final-payment
- `/api/payments` — create-order, verify (idempotent), history
- `/api/notifications` — list, mark-read
- `/api/wallet` — balance, transactions
- `/api/dashboard` — aggregated user stats
- `/api/admin` — venues approval, featured, stats
- `/api/owner-leads` — submit, list, status update

## Frontend Pages (14)

- `/` — Home (hero, featured venues, featured matches, sport filter)
- `/venues` — Venue browser (search, city/sport filters)
- `/venues/:id` — Venue detail (slots calendar, hosted matches)
- `/book/:venueId/:slotId` — Checkout (Razorpay 3-step flow)
- `/matches` — Hosted match browser (sport/city/skill filters)
- `/matches/:id` — Match detail (squad grid, join + pay flow)
- `/host` — Host a match form
- `/dashboard` — User stats overview
- `/dashboard/bookings` — My bookings
- `/dashboard/matches` — My matches (hosted + joined)
- `/wallet` — Wallet balance + transactions
- `/profile` — Profile editor
- `/admin` — Admin panel (venue approval, stats)
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

- **Payment flow**: createOrder → Razorpay checkout → verifyPayment (idempotent: checks razorpayOrderId) → action (createBooking / joinMatch)
- **Slot booking**: wrapped in a DB transaction to prevent double-booking race conditions
- **Match join**: checks existing participant before insert; player count updated atomically
- **req.params in Express**: always cast as `const id = req.params.id as string` (typed `string | string[]` by default)
- **Orval hooks**: path-only mutations take `{ matchId }` directly (no `{ data: ... }` wrapper); POST-with-body mutations take `{ data: Body }`
- **lib/db is composite**: run `pnpm run typecheck:libs` before api-server typecheck
- **Query invalidations**: `book.tsx` invalidates `bookings` + `getVenueSlots`; `match-detail.tsx` invalidates `getHostedMatch` + `listHostedMatches`

## Seeded Data

5 venues (3 Jaipur, 1 Delhi, 1 Bengaluru), 770 slots (14 days ahead). No hosted matches seeded — users create them via the Host page.
