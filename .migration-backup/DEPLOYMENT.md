# MATCHPIT — Deployment Guide

## Architecture Overview

| Service | Stack | Deploy Target |
|---------|-------|---------------|
| Frontend (`artifacts/matchpit`) | React + Vite + Tailwind | Vercel / Replit |
| API Server (`artifacts/api-server`) | Node.js + Express + Clerk | Vercel Functions / Railway / Replit |
| Database | PostgreSQL (Neon serverless) | Neon.tech |

---

## Required Environment Variables

### API Server (`artifacts/api-server/.env`)

```env
# Database — Neon PostgreSQL
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/matchpit?sslmode=require

# Clerk Authentication
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Razorpay Payments
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# CORS — comma-separated allowed origins
CORS_ORIGINS=https://matchpit.in,https://www.matchpit.in

# Server
PORT=8080
NODE_ENV=production
```

### Frontend (`artifacts/matchpit/.env`)

```env
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# API base URL (if not proxied via Vercel rewrites)
VITE_API_BASE_URL=https://api.matchpit.in

# Optional: Clerk proxy URL (for custom domain auth)
VITE_CLERK_PROXY_URL=https://matchpit.in/clerk
```

---

## Neon Database — Production Notes

1. **Create a Neon project** at [neon.tech](https://neon.tech)
2. Use the **pooled connection string** for the API server (append `?pgbouncer=true&connection_limit=1` for serverless)
3. Run migrations from workspace root:
   ```bash
   pnpm --filter @workspace/db db:push
   ```
4. Seed initial data (cities, referral config) via the Admin → Seed panel after first deploy
5. Enable **connection pooling** in Neon dashboard for production traffic
6. Set **compute auto-suspend** to 5 minutes to reduce costs during low traffic

---

## Razorpay Setup

1. Create account at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys** → Generate Live Key
3. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
4. Configure webhook:
   - URL: `https://api.matchpit.in/api/payments/webhook`
   - Events: `payment.captured`, `payment.failed`, `order.paid`
   - Copy the webhook secret to `RAZORPAY_WEBHOOK_SECRET`
5. For testing, use `rzp_test_*` keys — payments will use test mode automatically

---

## Build Commands

### From workspace root

```bash
# Install all dependencies
pnpm install

# Build shared libs (required before building apps)
pnpm --filter @workspace/db build
pnpm --filter @workspace/api-zod build
pnpm --filter @workspace/api-client-react build

# Build API server
pnpm --filter api-server build

# Build frontend
pnpm --filter matchpit build
```

### Individual builds

```bash
# API server only
cd artifacts/api-server && pnpm build

# Frontend only
cd artifacts/matchpit && pnpm build
```

---

## CORS Configuration

The API server reads `CORS_ORIGINS` as a comma-separated list. For production:

```env
CORS_ORIGINS=https://matchpit.in,https://www.matchpit.in
```

For local development:

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Healthcheck Verification

After deploy, verify the API is running:

```bash
curl https://api.matchpit.in/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

Verify database connectivity:

```bash
curl https://api.matchpit.in/api/health
# Should return db: "connected" in response
```

---

## Tester Account Setup

1. Sign up at `https://matchpit.in/sign-up` with a real email
2. In Neon console, run:
   ```sql
   UPDATE profiles SET is_admin = true WHERE email = 'your@email.com';
   ```
3. Log in and navigate to `/admin`
4. Use **Admin → Seed → Seed Full Ecosystem** to populate demo data
5. Use **Admin → Cities** to activate Jaipur
6. Use **Admin → Venues** to approve at least one venue

---

## Post-Deploy Checklist

- [ ] `DATABASE_URL` points to production Neon instance
- [ ] `CLERK_SECRET_KEY` is live key (not test)
- [ ] `RAZORPAY_KEY_ID` is live key
- [ ] Razorpay webhook URL configured and verified
- [ ] CORS origins include production domain
- [ ] `/api/health` returns 200
- [ ] Admin account created and `is_admin = true` set in DB
- [ ] Jaipur city activated in Admin panel
- [ ] At least one venue approved
- [ ] Referral config seeded (Admin → Referral tab)
