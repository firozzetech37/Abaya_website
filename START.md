# Starting the Abaya Platform locally

Run every command from the project folder:

```bash
cd /Users/vaasu/Downloads/abaya-platform
```

## Ports

| App | Command | Opens at |
| --- | --- | --- |
| API (always needed) | `pnpm --filter @abaya/api dev` | http://localhost:4000/v1/health |
| Admin panel | `pnpm --filter @abaya/admin dev` | http://localhost:3001 |
| Customer website | `pnpm --filter @abaya/web dev` | http://localhost:3000 |
| Customer app (in Chrome) | `pnpm --filter @abaya/mobile exec expo start --web` | http://localhost:8081 |
| AI service (optional) | `pnpm ai:dev` | http://localhost:8000/health |

Use one terminal tab per app. **Start the API first** — every other app talks to it.
The customer app and the tailor app both use port 8081, so run only one of them at a time.

---

## One-time setup

1. Install packages:
   ```bash
   pnpm install
   ```
2. Fill in `.env` (copy from `.env.example` if you don't have one). You need:
   - `DATABASE_URL` (port 6543) and `DIRECT_URL` (port 5432) — Supabase → Connect → ORMs → Prisma
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API
   - `CLERK_SECRET_KEY` (`sk_test_…`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
     `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (same `pk_test_…`) — Clerk → API keys
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — Razorpay test mode,
     **or** `PAYMENT_PROVIDER="fake"` to test orders without Razorpay (a "Simulate payment" button
     appears at checkout; development only)
   - `CORS_ORIGINS="http://localhost:3000,http://localhost:3001,http://localhost:8081"`
   - `EXPO_PUBLIC_API_URL="http://<your Mac's IP>:4000"` for a real phone (find the IP with
     `ipconfig getifaddr en0`); `http://localhost:4000` is fine for Chrome only
3. Create the database tables and sample data:
   ```bash
   pnpm --filter @abaya/db migrate:deploy
   pnpm db:seed
   pnpm --filter @abaya/db storage:setup     # creates the `designs` (public) + `private` buckets
   pnpm --filter @abaya/db seed:images       # sample pictures for the 10 sample abayas
   ```
   Run `pnpm --filter @abaya/db migrate:deploy` again whenever new migrations are added.
4. (Optional) AI assistant — needs Python 3.11+ (`python3 --version`):
   ```bash
   pnpm ai:setup
   ```
   In `.env`, keep `AI_SERVICE_URL="http://localhost:8000"` and any `AI_SERVICE_TOKEN` value
   (the API and the AI service both read it). Leave `AI_SERVICE_URL` empty to turn the AI off.

---

## Every day

### 1. API
```bash
pnpm --filter @abaya/api dev
```
Wait for `Nest application successfully started`. Check http://localhost:4000/v1/health shows `"db":"ok"`.

### 2. Admin panel
```bash
pnpm --filter @abaya/admin dev
```
Open http://localhost:3001 and sign in with your email code.
The first time only, make yourself super admin, then refresh the page:
```bash
pnpm --filter @abaya/db make-admin you@example.com
```

### 3. Customer website
```bash
pnpm --filter @abaya/web dev
```
Open http://localhost:3000. If port 3000 is busy (another project), stop that project or run
`pnpm --filter @abaya/web exec next dev -p 3100` and add `http://localhost:3100` to `CORS_ORIGINS`
(then restart the API).

### 4. Customer app
In Chrome:
```bash
pnpm --filter @abaya/mobile exec expo start --web
```
On a phone (Expo Go app, same Wi-Fi as the Mac):
```bash
pnpm --filter @abaya/mobile start
```
Scan the QR code. Payments and push notifications need a development build
(see `apps/mobile/README.md`).

### Workshop (pattern, cutting, stitching, QC, finishing, logistics)
Everyone uses the **admin website's login page** (http://localhost:3001):
1. In **Staff & roles → Add staff**, enter the person's email and tick their station(s).
   For a tailor tick **Tailor** and enter their city.
2. They sign in with that email (email code) and land on their own page:
   one station → `/workshop/<station>`, several → `/workshop`. Office staff land on the dashboard.

Details: `docs/apps/workshop.md`.

### 6. AI assistant (optional)
```bash
pnpm ai:dev
```
The first start downloads the image model (~350 MB, once). Ready when
http://localhost:8000/health shows `"loaded":true`. Then restart the API: it queues every
existing design and reference image, and the **AI assistant** card on each design shows
suggested tags and look-alike designs. Duplicates are flagged in the review queue.

---

## Useful commands

| What | Command |
| --- | --- |
| Row counts per table | `pnpm db:counts` |
| Database browser | `pnpm db:studio` |
| Typecheck everything | `pnpm typecheck` |
| Lint everything | `pnpm lint` |
| Unit tests | `pnpm test` |
| API end-to-end tests (local Postgres) | `pnpm test:e2e` |
| AI service tests | `pnpm ai:test` |

## If something goes wrong

| You see | Do this |
| --- | --- |
| `Invalid API environment. Fix these values in .env:` | Fill in the listed `.env` values, restart the API |
| Admin spins forever | The API is not running — start it (step 1) |
| "Login is not configured" | Put real Clerk keys in `.env` (not `pk_test_...`), restart that app |
| `Could not find the module … React Client Manifest` | Stop the app, run `rm -rf apps/admin/.next` (or `apps/web/.next`), start again |
| Expo app shows an old error after a config change | Start it with `-c` to clear the cache, e.g. `pnpm --filter @abaya/mobile exec expo start --web -c` |
| Chrome app can't reach the API | Add `http://localhost:8081` to `CORS_ORIGINS`, restart the API |
| `Port … is already in use` | Stop the other program using it, or pick another port |
| AI card says "AI service is not reachable" | Start it with `pnpm ai:dev` (step 6); queued images are analysed automatically |
| AI card says "The AI assistant is off" | Set `AI_SERVICE_URL` and `AI_SERVICE_TOKEN` in `.env`, restart the API |
| `pnpm ai:setup` fails | Install Python 3.11+ from python.org, then run it again |

Stop any app with `Ctrl + C`.
