# Abaya Platform

Made-to-order abaya platform for women in India. Designers upload catalogs; the
admin reviews, prices and publishes every design; customers browse, redesign
(fabric, colour, sleeves, embellishment, closure, add-ons) and order an abaya
stitched to their own measurements by partner tailors, tracked stage by stage.

Read these before large changes:
- `docs/architecture.md` — system design, modules, data flow
- `docs/domain-model.md` — entities, states, pricing, roles
- `docs/api-conventions.md` — REST, errors, auth, pagination
- `docs/apps/*.md` — screen-by-screen spec for each app
- `docs/build-plan.md` — the ordered build steps; do ONE step per session

## Monorepo map

| Path | What | Stack |
| --- | --- | --- |
| `apps/api` | Backend, the only thing that touches the database | NestJS 10, TypeScript, Prisma |
| `apps/web` | Customer website | Next.js 15 App Router, Tailwind, shadcn/ui, TanStack Query |
| `apps/admin` | Admin panel (catalog, pricing, orders, staff) + `/workshop` (the six production stations, docs/apps/workshop.md) + `/studio` (Designer Studio: AI Design, AI Catalog with FASHN, Pinterest inspiration, docs/apps/studio.md) | Next.js 15, Tailwind, shadcn/ui |
| `apps/mobile` | Customer app (Android + iOS) | Expo SDK (latest), Expo Router, NativeWind |
| `packages/db` | Prisma schema, migrations, seed, Prisma client export | Prisma 6 |
| `packages/contracts` | Shared enums, Zod schemas, pricing function, API types | TypeScript, Zod |
| `packages/ui` | Shared design tokens + web components (Phase 1) | Tailwind preset |
| `packages/config` | Shared eslint / tsconfig / tailwind presets | — |
| `services/ai` | Python AI service (Phase 2): tagging, dedupe, tech packs, try-on | FastAPI |

Package names use the `@abaya/` scope (e.g. `@abaya/contracts`, `@abaya/db`).

## Infrastructure

- Database: **Supabase Postgres** via Prisma.
  `DATABASE_URL` = pooler port 6543 with `?pgbouncer=true` (runtime).
  `DIRECT_URL` = port 5432 (migrations only). Never run migrations over 6543.
- Auth: **Clerk** (email code, phone SMS code, Google, Apple; TOTP MFA for staff).
  Clients log in with Clerk; the API verifies the Clerk session token, then loads
  our own `User` row (by `authUserId` = Clerk user id) and roles. Roles live in
  OUR database, never in Clerk metadata. Supabase is database + storage only
  (ADR 0004).
- Files: **Supabase Storage**. Clients upload via short-lived signed URLs issued
  by the API. Public bucket `designs` (published product images only);
  private bucket `private` (measurements photos, QC photos, tech packs).
- Clients (web, admin, mobile, maker) NEVER query Supabase tables directly and
  never hold the service-role key. Everything goes through `apps/api`.
- Payments: Razorpay (UPI, cards). Test keys only in development.
- Jobs/cache: none in Phase 1. Notifications use a Postgres outbox (Step 13).
  BullMQ on Upstash Redis when AI jobs arrive (Step 15+).

## Architecture rules (enforced in review)

1. Each API module lives in `apps/api/src/modules/<name>/` with four layers:
   `domain/` → `application/` → `infrastructure/` → `interface/`.
2. `domain/` is plain TypeScript: no NestJS, Prisma, Supabase, Razorpay imports.
3. `application/` holds use cases and **ports** (interfaces); it depends only on
   `domain/` and ports. Concrete adapters live in `infrastructure/`.
4. Modules never read or write another module's tables. They call the other
   module's exported application service or listen to its domain events.
5. Money is always integer **paise** (`priceInPaise: number`). Never floats.
6. All input is validated with Zod schemas from `@abaya/contracts`, on both
   client and server.
7. Every price change, publish, refund, role change and order-stage change is
   written to `AuditLog`.
8. Role checks happen in the API (guards), never only in the UI.

## Business rules that must never break

- Only designs with status `PUBLISHED` are visible to customers.
- Design status flow: `DRAFT → IN_REVIEW → PRICED → PUBLISHED → ARCHIVED`
  (review can send it to `CHANGES_REQUESTED`). Full table in `docs/domain-model.md`.
- Customers only ever see **web-size previews** (1600px, no visible watermark) of design images; originals stay private.
  A design can also be sold as an **HD download** (personal-use licence, its own purchase and
  payment, never an order or workshop job). docs/apps/web.md "HD download".
- Designers are in-house. Submitting a design for review needs the designer's originality
  statement. Pinterest pins are viewed and linked only: their images are never downloaded,
  stored or sent to the AI (docs/apps/studio.md).
- Pinterest / external-API images are `Reference` rows, **never** products:
  `IMPORTED → IN_REVIEW → NEEDS_DESIGN → DESIGNED` (or `REJECTED`). A designer
  creates an original `Design` from a reference; reference images are never
  shown to customers.
- Price = design base price + sum of selected option surcharges + size-band
  adjustment. Use `calculatePrice()` from `@abaya/contracts` everywhere; the
  API recalculates at checkout and ignores any price sent by a client.
- Each `OrderItem` (one abaya) has its own production stage, one workshop station per step:
  `PLACED → SPEC_APPROVED → PATTERN → CUTTING → STITCHING → QC → FINISHING → PACKED → SHIPPED → DELIVERED`
  (plus `CANCELLED`, `REMAKE`, `ON_HOLD`). Stages only move forward except QC fail → the
  station that caused it (`STITCHING`, `CUTTING` or `PATTERN`) and `ON_HOLD` → back to where
  it was held. `ASSIGNED` is the old flow's stage, kept for history only.
  `Order.status` is payment-level: `PENDING_PAYMENT → PAID → COMPLETED` / `CANCELLED` / `REFUNDED`.
- Order items store snapshots (design, options, measurements, price breakdown);
  later edits to a design or profile never change an existing order.
- Partner tailors see only their assigned orders and never customer phone, email
  or full address. No workshop station except Logistics sees customer contact details,
  and workshop notes are never shown to customers.

## Roles

`SUPER_ADMIN`, `CATALOG_MANAGER`, `PRODUCTION_MANAGER`, `DESIGNER`, `QC`,
`SUPPORT`, `MAKER`, `CUSTOMER`, and the workshop stations `PATTERN_TECHNICIAN`, `CUTTER`,
`FINISHER`, `LOGISTICS`. Staff are added by email (Staff & roles → Add staff) and get their
roles on first sign-in. Permissions are listed in `docs/domain-model.md`.

## Commands

```bash
pnpm install          # install everything
pnpm dev              # run all apps (turbo)
pnpm --filter @abaya/api dev
pnpm --filter @abaya/web dev
pnpm --filter @abaya/admin dev
pnpm --filter @abaya/mobile start   # then scan the QR with Expo Go
pnpm db:migrate       # prisma migrate dev (uses DIRECT_URL)
pnpm db:generate      # regenerate Prisma client
pnpm db:seed          # load sample abayas, options and staff users
pnpm test             # all tests
pnpm typecheck
```

## Conventions

- TypeScript `strict`. No `any` without a comment explaining why.
- File names: kebab-case. React components: PascalCase exports.
- API routes: see `docs/api-conventions.md` (`/v1/...`, plural nouns).
- Tests: Vitest for packages and domain logic, Jest (NestJS default) for API e2e.
  Every domain rule and the pricing function must have unit tests.
- UI copy is English first; keep all user-facing strings in one place per app.
  The customer website is English + Arabic (`/ar`, right-to-left): every string exists in
  `apps/web/content/strings.ts` and `strings.ar.ts` (docs/apps/web.md "Languages").
- Secrets live only in `.env` (see `.env.example`). Never print or commit them.

## How to work in this repo (for Claude)

- Follow `docs/build-plan.md`. Do one step at a time; finish with tests passing,
  `pnpm typecheck` clean, and a short summary of what changed.
- Before creating a new file, check whether a shared type or schema already
  exists in `@abaya/contracts`.
- If a requirement is unclear or conflicts with these docs, ask instead of guessing.
- Prefer small commits with clear messages after each working step.
