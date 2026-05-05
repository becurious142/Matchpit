# MATCHPIT — Vercel Deployment Guide

## Project Structure on Vercel

MATCHPIT uses a **monorepo** with two separate Vercel projects:
- **Frontend**: `artifacts/matchpit` → deployed as a Vite SPA
- **API Server**: `artifacts/api-server` → deployed as Node.js serverless functions

---

## Step 1 — Deploy the API Server

### 1.1 Create Vercel Project for API

```bash
cd artifacts/api-server
vercel
```

- Framework: **Other**
- Root directory: `artifacts/api-server`
- Build command: `pnpm build`
- Output directory: `dist`
- Install command: `pnpm install`

### 1.2 Add `vercel.json` to api-server (if not present)

```json
{
  "version": 2,
  "builds": [{ "src": "dist/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "dist/index.js" }]
}
```

### 1.3 Set Environment Variables in Vercel Dashboard

Go to **Project → Settings → Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://...@neon.tech/matchpit?sslmode=require` |
| `CLERK_SECRET_KEY` | `sk_live_...` |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `RAZORPAY_KEY_ID` | `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | `...` |
| `RAZORPAY_WEBHOOK_SECRET` | `...` |
| `CORS_ORIGINS` | `https://matchpit.in,https://www.matchpit.in` |
| `NODE_ENV` | `production` |

### 1.4 Deploy

```bash
vercel --prod
```

Note the deployed URL, e.g. `https://matchpit-api.vercel.app`

---

## Step 2 — Deploy the Frontend

### 2.1 Create Vercel Project for Frontend

```bash
cd artifacts/matchpit
vercel
```

- Framework: **Vite**
- Root directory: `artifacts/matchpit`
- Build command: `pnpm build`
- Output directory: `dist`
- Install command: `pnpm install`

### 2.2 Set Environment Variables

| Variable | Value |
|----------|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_API_BASE_URL` | `https://matchpit-api.vercel.app` |

### 2.3 Add `vercel.json` for SPA routing

Create `artifacts/matchpit/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://matchpit-api.vercel.app/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

> The `/api/(.*)` rewrite proxies all API calls to the backend, so the frontend can use relative `/api/` paths without CORS issues.

### 2.4 Deploy

```bash
vercel --prod
```

---

## Step 3 — Custom Domain Setup

1. In Vercel Dashboard → Frontend project → **Domains**
2. Add `matchpit.in` and `www.matchpit.in`
3. Update DNS at your registrar:
   ```
   A     @    76.76.21.21
   CNAME www  cname.vercel-dns.com
   ```
4. Update `CORS_ORIGINS` in API server env vars to include the custom domain

---

## Step 4 — Clerk Configuration for Production

1. In [Clerk Dashboard](https://dashboard.clerk.com):
   - Go to **Domains** → Add `matchpit.in`
   - Go to **API Keys** → Copy live publishable + secret keys
2. Update both Vercel projects with live Clerk keys
3. Set allowed redirect URLs in Clerk:
   - `https://matchpit.in/sign-in`
   - `https://matchpit.in/sign-up`
   - `https://matchpit.in/dashboard`

---

## Step 5 — Razorpay Webhook for Production

1. In Razorpay Dashboard → **Settings → Webhooks → Add New**
2. URL: `https://matchpit-api.vercel.app/api/payments/webhook`
3. Secret: generate a random string, set as `RAZORPAY_WEBHOOK_SECRET`
4. Events to subscribe:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`

---

## Step 6 — Database Migration

Run from your local machine with production `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db db:push
```

Or use Neon's SQL editor to verify tables exist after first deploy.

---

## Step 7 — Healthcheck Verification

```bash
# API health
curl https://matchpit-api.vercel.app/api/health

# Frontend loads
curl -I https://matchpit.in
# Expected: HTTP/2 200
```

---

## Redeployment

```bash
# Redeploy API
cd artifacts/api-server && vercel --prod

# Redeploy Frontend
cd artifacts/matchpit && vercel --prod
```

Or push to `main` branch if GitHub integration is configured — Vercel auto-deploys on push.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `CORS error` on API calls | Check `CORS_ORIGINS` includes frontend domain |
| `401 Unauthorized` on all routes | Verify `CLERK_SECRET_KEY` is set correctly |
| Payments not completing | Check Razorpay webhook URL and secret |
| DB connection timeout | Use Neon pooled connection string with `pgbouncer=true` |
| SPA routes return 404 | Ensure `vercel.json` rewrite to `index.html` is present |
| `onboardingComplete` not saving | Verify `PATCH /api/profile/me` route is accessible |
