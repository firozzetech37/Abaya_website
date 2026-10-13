# Deploying to production

Order matters: **Supabase → API → web + admin → Razorpay webhook → mobile builds → smoke test.**
Every command below runs from the repo root unless it says otherwise.

| Piece | Where | Region |
| --- | --- | --- |
| Database, Auth, Storage | Supabase project `abaya-prod` (Pro plan) | Mumbai (`ap-south-1`) |
| API (`apps/api`) | Render or Railway, Docker (`apps/api/Dockerfile`) | Singapore (closest to India on both) |
| Website (`apps/web`) | Vercel project `abaya-web` | `bom1` (Mumbai) functions |
| Admin (`apps/admin`) | Vercel project `abaya-admin` | `bom1` |
| Customer app | EAS Build → Play Store / App Store | — |

---

## 1. Supabase `abaya-prod`

1. Create the project in **Mumbai**, on the **Pro** plan (free projects pause and have no backups).
   Turn on Point-in-Time Recovery (Database → Backups).
2. **Migrations** — from your laptop, with the PROD connection strings in a temporary env file that is
   never committed (`.env.production.local` is git-ignored):
   ```bash
   # DATABASE_URL = pooler 6543 ?pgbouncer=true&connection_limit=1 ; DIRECT_URL = 5432
   pnpm --filter @abaya/db exec dotenv -e ../../.env.production.local -- prisma migrate deploy
   pnpm --filter @abaya/db exec dotenv -e ../../.env.production.local -- tsx prisma/row-counts.ts
   ```
   Every table must show `rls on`. **Do not run the seed in production** — it publishes sample designs
   with placeholder prices. Create real designs in the admin panel.
3. **Storage** → create buckets:
   - `designs` — **public**, allowed MIME `image/jpeg,image/png,image/webp`, max 10 MB.
   - `private` — **private**, same MIME types, max 10 MB.
4. Copy for the next steps: Project URL and service-role key (Settings → API). Login is not Supabase
   (see step 1b).

## 1b. Clerk (login) — production instance

1. In the Clerk dashboard, create a **production instance** of the Abaya app and verify your domain
   (Clerk shows the DNS records to add). Production emails and SMS are sent from that domain.
2. **User & authentication**:
   - Email address → sign-in with **Email verification code**.
   - Phone number → **SMS verification code** (tailor app; SMS to India may need a paid plan).
   - Social: **Google** and **Apple** — production needs your own Google OAuth client and Apple Services
     ID/key (Clerk's shared dev credentials only work in development).
   - Multi-factor → **Authenticator application (TOTP)** for staff.
3. **Native apps**: allowlist the redirect URLs `abaya://` (customer app) and `abaya-maker://` (tailor app).
4. **Domains / allowed origins**: add the website and admin domains.
5. API keys → copy the **publishable key** (`pk_live_…`) and **secret key** (`sk_live_…`). Optional: the
   **JWT public key** (PEM) for `CLERK_JWT_KEY`, so the API verifies tokens without a network call.

## 2. API on Render (or Railway)

**Render** — New → Web Service → "Deploy an existing image" is not needed; choose the repo and:
- Runtime **Docker**, Dockerfile path `apps/api/Dockerfile`, Docker context `.` (repo root).
- Region **Singapore**, instance ≥ 1 GB RAM.
- Health check path `/v1/health`.
- **Pre-deploy command**: `docker-entrypoint.sh migrate` (applies migrations over `DIRECT_URL` before
  the new version takes traffic; never over the 6543 pooler).
- Environment variables (all required unless marked optional):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_PORT` | optional — the API uses the host's `PORT` when this is unset, else `4000` |
| `API_PUBLIC_URL` | `https://api.<domain>` |
| `WEB_PUBLIC_URL` | `https://<web domain>` (links in emails) |
| `CORS_ORIGINS` | `https://<web domain>,https://<admin domain>` |
| `DATABASE_URL` | prod pooler URL, port **6543**, `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | prod session URL, port **5432** (migrations only) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | from step 1 (database + storage) |
| `CLERK_SECRET_KEY` | from step 1b (`sk_live_…`) |
| `CLERK_JWT_KEY` | optional, from step 1b (PEM; put newlines as `\\n`) |
| `SUPABASE_STORAGE_BUCKET_DESIGNS` / `_PRIVATE` | `designs` / `private` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | **test** keys until KYC is approved |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional; without a key no emails are sent |
| `WHATSAPP_PROVIDER` (+ key, Gupshup ids) | optional; `none` until templates are approved — see `docs/whatsapp-templates.md` |
| `PUSH_ENABLED` / `EXPO_ACCESS_TOKEN` | push on by default; the token is optional |
| `STAFF_MFA_REQUIRED` | optional; defaults to `true` in production |

**Railway** — New project → Deploy from repo → set "Dockerfile path" `apps/api/Dockerfile`, root
directory `/`, region Singapore, the same variables, health check `/v1/health`, and add a
deploy "pre-start" command `docker-entrypoint.sh migrate`.

Check: `curl https://api.<domain>/v1/health` → `{"status":"ok","db":"ok",...}`.
Swagger (`/v1/docs`) is disabled in production.

## 2b. AI service (optional — the admin AI assistant)

Skip this to launch without it: leave `AI_SERVICE_URL` unset on the API and the admin
panel shows "AI assistant is off".

**Render** — New → Private Service (not public) from the repo:
- Runtime **Docker**, Dockerfile path `services/ai/Dockerfile`, Docker context `services/ai`.
- Region **Singapore** (same as the API), instance with **2 GB RAM** (CLIP runs on CPU;
  the model is baked into the image, so start-up needs no download).
- Health check path `/health`.
- Environment: `AI_SERVICE_TOKEN` (long random, e.g. `openssl rand -hex 32`),
  `SUPABASE_URL` (so its host is allowed for downloads), optional `AI_TAGGER`
  (`clip` default; `claude` + `ANTHROPIC_API_KEY` later).

Then on the **API** service add `AI_SERVICE_URL` = the private URL
(e.g. `http://abaya-ai:8000`) and the same `AI_SERVICE_TOKEN`. Optional:
`AI_DUPLICATE_THRESHOLD` (0.96), `AI_SIMILAR_THRESHOLD` (0.93).

Check: Admin → Designs → any design → the **AI assistant** card shows suggestions
within a minute of adding an image; `GET /v1/admin/ai/status` shows `reachable: true`.
Existing images are queued automatically when the API starts.

## 3. Website and admin on Vercel

Create two Vercel projects from the same repo:

| Setting | `abaya-web` | `abaya-admin` |
| --- | --- | --- |
| Root directory | `apps/web` | `apps/admin` |
| Framework | Next.js | Next.js |
| Install command | `pnpm install --frozen-lockfile` | same |
| Build command | `cd ../.. && pnpm turbo run build --filter=@abaya/web` | `... --filter=@abaya/admin` |
| Function region | `bom1` | `bom1` |

Environment variables (both): `NEXT_PUBLIC_API_URL=https://api.<domain>`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (used by Clerk's middleware on the server).
Never add the Supabase service-role key to Vercel. Point the domains (`www.<domain>`, `admin.<domain>`) and
add them to Clerk's allowed origins and the API's `CORS_ORIGINS`.

## 4. First super admin

1. Log in once on the admin site with your email code (Clerk; this creates your user as CUSTOMER).
2. From your laptop with the prod env file:
   ```bash
   pnpm --filter @abaya/db exec dotenv -e ../../.env.production.local -- tsx prisma/make-admin.ts you@yourdomain.com
   ```
3. Refresh; in production set up the authenticator app when asked, then give other staff their roles in **Staff & roles**
   (each person must log in once first).

## 5. Razorpay (live — only after KYC is approved)

1. Dashboard → switch to **Live** → API keys → generate; put them in the API env and redeploy.
2. Settings → Webhooks → add `https://api.<domain>/v1/payments/webhook` with a strong secret
   (same value as `RAZORPAY_WEBHOOK_SECRET`) and events: `payment.captured`, `payment.failed`,
   `refund.processed`, `refund.failed`.
3. Payment capture: automatic.

## 6. Push notifications (customer app)

1. `npx eas-cli init` in `apps/mobile` (gets an EAS project id).
2. Android: create a Firebase project, add the Android app (`in.abaya.app`),
   create an FCM V1 service-account key and upload it with `npx eas-cli credentials`.
3. iOS: `npx eas-cli credentials` creates the APNs key.
4. Optional: Expo → Access tokens → "Enhanced security for push" → put the token in
   `EXPO_ACCESS_TOKEN`.

Notifications are queued in the `Notification` table and sent by a worker inside the API
(retries with backoff), so no extra service is needed.

## 7. Customer app (EAS)

From `apps/mobile` (see its README for development builds):
```bash
npx eas-cli login
npx eas-cli init                      # writes the EAS project id
npx eas-cli secret:create --name EXPO_PUBLIC_API_URL --value https://api.<domain>
npx eas-cli secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_live_...
npx eas-cli build --profile production --platform android
npx eas-cli build --profile production --platform ios
npx eas-cli submit --platform android   # and ios
```
Replace the placeholder `in.abaya.app` package/bundle id in `app.config.ts` before the first build.

**Store listing checklist**
- [ ] Privacy policy URL (`https://<web domain>/policies/privacy`) and support email.
- [ ] Play **Data safety** / App Store **privacy labels**: email, phone, name, address, body
      measurements (health & fitness-adjacent "other personal data"), purchase history; used for app
      functionality; not sold; encrypted in transit; users can request deletion.
- [ ] Account deletion inside the app (Account → Privacy → Delete account) and a web link
      (`/account`), as both stores require.
- [ ] Sign in with Apple enabled (required on iOS because Google login is offered).
- [ ] Screenshots (6.7" iPhone, 6.5" iPhone, Android phone), feature graphic, app icon 1024².
- [ ] Content rating questionnaire; target audience 18+.

## 8. Go-live smoke test (₹1 product)

1. Admin: create a design "Test ₹1", base price ₹1 (100 paise), allow one value in each required group,
   one image, publish.
2. Web and app: order it with a real UPI payment; confirm the order turns **PAID** in admin and the
   customer gets the confirmation email.
3. Admin: approve tech pack → assign a maker → move through the stages with photos → QC pass → ship →
   deliver; the customer page shows every step.
4. Refund the ₹1 from the order page; check Razorpay shows the refund and the order becomes REFUNDED.
5. Archive the test design.

## 9. Before launch (compliance)

- Have a lawyer review `/policies/*` (placeholders), GST registration and invoice format, and the
  grievance officer details (Consumer Protection (E-Commerce) Rules 2020).
- Breach playbook: who is on call, how to rotate Supabase/Razorpay keys, the 72-hour DPDP notice.
- Turn on Sentry (or similar) for api/web/admin/mobile.
