# Abaya Platform

Made-to-order abayas for women in India: designer catalog, admin pricing,
customer redesign, made-to-measure stitching by partner tailors, tracked stage
by stage. Customer website, Android/iOS app, admin panel (with the workshop stations) and API in
one monorepo.

## What is here

| Path | What |
| --- | --- |
| `apps/api` | NestJS API — identity, catalog, pricing, customer, orders, payments (Razorpay), production, notify, privacy, audit. 68 unit + 30 e2e tests |
| `apps/admin` | Admin panel (port 3001) — designs, review, pricing, options, collections, references, orders board, production actions, makers, staff, audit |
| `apps/web` | Customer website (port 3000) — catalog, redesign panel, bag, Razorpay checkout, orders, account, policies |
| `apps/mobile` | Customer app (Expo SDK 57) — see `apps/mobile/README.md` to run on an Android phone |
| `packages/db` | Prisma schema, migrations (init, RLS, order numbers), seed, `make-admin`, `counts` |
| `packages/contracts` | Shared enums, Zod schemas, response types, `calculatePrice()`, state machines |
| `packages/config` / `packages/ui` | tsconfig/ESLint (with API layer boundaries)/Tailwind presets; design tokens |
| `docs/deploy.md` | Production deployment runbook (Supabase, Render/Railway, Vercel, Razorpay, EAS) |

## Run locally

After filling `.env` (Supabase dev project for the database + storage, Clerk keys for login, Razorpay test keys):

```bash
pnpm install
pnpm --filter @abaya/db migrate:deploy && pnpm db:seed
pnpm --filter @abaya/api dev        # http://localhost:4000/v1  (Swagger: /v1/docs)
pnpm --filter @abaya/web dev        # http://localhost:3000
pnpm --filter @abaya/admin dev      # http://localhost:3001
# log in once on the admin site, then: pnpm --filter @abaya/db make-admin you@example.com
```

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` (needs a local Postgres;
set `E2E_DATABASE_URL`, default `postgresql://postgres@127.0.0.1:55432/abaya_e2e` — it is wiped).

## Start

1. Install Node 22, pnpm 9 (`npm i -g pnpm`), Git, VS Code + the Claude Code extension.
2. Unzip this folder, then in a terminal inside it:
   ```bash
   git init && git add . && git commit -m "Starter kit"
   cp .env.example .env    # fill in Supabase (database + storage), Clerk (login) and Razorpay test keys
   ```
3. Open the folder in VS Code (`code .`), open Claude Code, and follow
   `docs/build-plan.md` from Step 0.

## Stack

Next.js 15 · Expo (React Native) · NestJS 10 · Prisma 6 · Supabase (Postgres,
Storage) · Clerk (login) · Razorpay · Turborepo + pnpm · Zod · Tailwind + shadcn/ui ·
Python FastAPI for AI (Phase 2).
