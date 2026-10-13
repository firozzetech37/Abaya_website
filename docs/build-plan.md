# Build plan — step by step with Claude Code

How to use this file:
1. Open the project folder in VS Code and open the Claude Code panel.
2. Start a **new conversation for each step**.
3. Switch to **Plan mode** (`/plan`), paste the step's prompt, read the plan,
   comment on it, then approve.
4. When Claude finishes, run the "Done when" checks yourself, then ask Claude to
   commit: `commit this step with a clear message`.
5. Do not skip ahead: later steps assume earlier ones work.

Phase 1 (steps 0–11) = MVP: designer catalog → admin pricing → customer
redesign → order → partner tailor → delivery. Phase 2 is listed at the end.

---

## Step 0 — Accounts and secrets (you, not Claude)

- [ ] Node 22, pnpm 9, Git, VS Code + Claude Code extension installed.
- [ ] Two Supabase projects: `abaya-dev` and `abaya-prod` (region closest to India).
- [ ] In `abaya-dev` → Storage: create bucket `designs` (public) and `private` (private).
- [ ] In `abaya-dev` → Authentication → Providers: enable Email (OTP). Phone OTP
      and Google can come later.
- [ ] Razorpay account in **test mode**; copy test key id and secret.
- [ ] Copy `.env.example` to `.env` and fill in the `abaya-dev` values.
- [ ] `git init` and first commit of this starter kit.

---

## Step 1 — Monorepo foundation

```text
Read CLAUDE.md and docs/architecture.md. Set up the monorepo foundation:
1. Create packages/config with shared tsconfig presets (base, nextjs, react-native, nestjs),
   an ESLint flat config (typescript-eslint + import boundaries), and a Tailwind preset
   with our design tokens (neutral palette, one accent colour, font scale).
2. Create packages/ui as an empty shared package that exports the Tailwind preset tokens.
3. Make packages/contracts and packages/db work in the workspace: install deps, add a
   vitest config to contracts, make `pnpm --filter @abaya/contracts test` pass
   (tests already exist), and make `pnpm --filter @abaya/db validate` pass.
4. Add root scripts that work with turbo, and a GitHub Actions workflow that runs
   install, typecheck, lint and test on pull requests.
Do not create the apps yet.
```

**Done when:** `pnpm install` works · `pnpm --filter @abaya/contracts test` passes
(19 tests) · `pnpm --filter @abaya/db validate` says the schema is valid ·
`pnpm typecheck` passes.

---

## Step 2 — Database on Supabase

```text
Using packages/db/prisma/schema.prisma and my .env (DATABASE_URL + DIRECT_URL for Supabase):
1. Create the first migration with `pnpm db:migrate` named "init".
2. Add a second SQL migration "enable_rls" that runs
   ALTER TABLE ... ENABLE ROW LEVEL SECURITY for every table in the public schema
   (no policies — only our API, which connects as the owner, may access data).
3. Run the seed (`pnpm db:seed`) and show me the row counts per table.
If a migration hangs, check that DIRECT_URL (port 5432) is being used for migrate.
```

**Done when:** tables visible in the Supabase table editor · RLS shows as
enabled · 6 option groups, 7 size bands, 3 collections, 10 designs seeded.

---

## Step 3 — API skeleton, auth and roles

```text
Create apps/api as described in docs/apps/api.md and docs/api-conventions.md:
- NestJS 10 app on port 4000 with /v1 prefix, helmet, CORS from CORS_ORIGINS, pino logging.
- common/config: Zod-validated env (fail fast on missing values).
- common/prisma: PrismaService using @abaya/db.
- common/errors: DomainError base + global exception filter producing the apiError shape.
- common/zod: ZodValidationPipe and @ZodBody/@ZodQuery decorators using @abaya/contracts.
- common/auth: SessionAuthGuard (verify the Clerk session token — originally Supabase, see ADR 0004 — load or create our User by authUserId),
  @Public(), @Roles(), RolesGuard, @CurrentUser(). Guards are global; routes opt out with @Public().
- common/audit: AuditService.
- identity module (domain/application/infrastructure/interface): GET/PATCH /v1/me,
  addresses CRUD, consent recording.
- GET /v1/health (public).
- Unit tests for the roles guard and e2e tests for 401/403 cases.
Explain how I log in once and then promote myself with `pnpm --filter @abaya/db make-admin <email>`.
```

**Done when:** `pnpm --filter @abaya/api dev` starts · `/v1/health` returns ok ·
`/v1/me` without a token → 401 · tests pass.

---

## Step 4 — Catalog and pricing API

```text
Implement the catalog and pricing modules per docs/domain-model.md §2–3 and the endpoint map
in docs/api-conventions.md:
- Public: GET /v1/designs (filters, cursor pagination, only PUBLISHED), GET /v1/designs/:slug
  (designDetail with option groups, per-design surcharges applied, size bands, public image URLs),
  GET /v1/collections, POST /v1/pricing/quote (uses calculatePrice from @abaya/contracts).
- Admin: designs CRUD, image attach via signed upload URL (POST /v1/admin/uploads using
  Supabase Storage), PUT options, POST transition (enforce DESIGN_TRANSITIONS + the role table
  + the PRICED/PUBLISHED preconditions), option values and size bands CRUD, collections CRUD,
  references (manual upload only for now).
- Every price/status change writes AuditLog with before/after.
- Domain unit tests for the Design aggregate transitions and preconditions; e2e test for
  draft → review → priced → published → visible in public list.
```

**Done when:** the 10 seeded designs list at `/v1/designs` · a quote for a design
with satin + back stonework returns the right breakdown · a designer cannot publish (403).

---

## Step 5 — Admin panel: catalog and pricing

```text
Create apps/admin (Next.js 15, port 3001) per docs/apps/admin.md:
- Supabase email-OTP login; layout guard that allows only staff roles; navigation filtered by role.
- Typed API client that attaches the Supabase token and uses @abaya/contracts types.
- Screens: Dashboard (placeholder counts), Designs list with status tabs, Design editor
  (Details, Images with drag-and-drop upload via signed URLs, Options & price with live
  calculatePrice preview and margin, status actions from DESIGN_TRANSITIONS), Review queue,
  Options & sizes, Collections, References (manual upload + assign to designer),
  Staff & roles (SUPER_ADMIN).
- Use shadcn/ui, react-hook-form + zod resolvers, TanStack Query/Table.
```

**Done when:** you can log in as SUPER_ADMIN, create a design, upload images,
set options and price, move it to PUBLISHED, and see it in `/v1/designs`.

---

## Step 6 — Customer website: browse and redesign

```text
Create apps/web (Next.js 15, port 3000) per docs/apps/web.md:
- Home, /abayas with filters and infinite scroll, /collections/[slug], /abayas/[slug] with
  gallery and the Redesign panel (local calculatePrice + debounced server quote, size bands
  vs measurement profile), SEO metadata and OG images.
- Supabase login (email OTP, Google), /account with profile, addresses, measurement profiles
  (guided form with measurementBody validation and diagrams placeholders), wishlist.
- Mobile-first; check layouts at 360 px.
```

**Done when:** browsing and redesigning works on your phone's browser, prices
match the server quote, and measurement profiles save.

---

## Step 7 — Cart, checkout, payments, orders

```text
Implement the customer, orders and payments modules and the matching web pages:
- Cart API (items store selected options + size band or measurement profile; GET returns fresh quotes).
- POST /v1/checkout: re-quote every item, create Order (PENDING_PAYMENT) with OrderItems holding
  design/options/measurements/price snapshots and a human orderNumber (AB-YYYY-000123),
  create a Razorpay order, return checkoutResponse.
- POST /v1/payments/verify and POST /v1/payments/webhook (raw body, HMAC signature check,
  idempotent) → PaymentCaptured → Order PAID, placedAt set, items at PLACED.
- Web: /bag, /checkout with Razorpay Checkout (test mode), success page, /orders, /orders/[orderNumber]
  with a stage timeline.
- Email confirmation via the notify module (Resend) — skip if RESEND_API_KEY is empty.
- e2e test: add to cart → checkout → simulated webhook → order PAID. Tampered client price is ignored.
```

**Done when:** a test payment in Razorpay test mode produces a PAID order visible
in the customer's order page and in admin.

---

## Step 8 — Customer mobile app

```text
Create apps/mobile (Expo latest SDK, Expo Router, NativeWind) per docs/apps/mobile.md, reusing
@abaya/contracts and the same API endpoints: tabs (Home, Shop, Bag, Account), design detail with
a Redesign bottom sheet, measurement flow, checkout with react-native-razorpay, orders with stage
timeline, login with Supabase (email OTP; Google + Sign in with Apple), in-app account deletion.
Configure app.config.ts (name, scheme "abaya", Android package and iOS bundle id placeholders)
and EAS development builds, because Razorpay's native module does not run in Expo Go.
Tell me exactly which commands to run to test on my Android phone.
```

**Done when:** the development build runs on your Android phone, you can
redesign, pay in test mode and see the order.

---

## Step 9 — Production workflow in admin

```text
Implement the production module and admin order screens per docs/apps/admin.md:
- Orders kanban by stage + table; order detail with snapshots, price breakdown, stage timeline.
- Tech pack form (manual in Phase 1) with printable view; approve → SPEC_APPROVED.
- Makers CRUD; assign maker with due date → ASSIGNED.
- Stage photo upload (private bucket, signed URLs) for CUTTING and STITCHING.
- QC checklist pass/fail (fail → STITCHING with notes).
- Mark shipped (carrier + tracking) → SHIPPED; mark delivered → DELIVERED; order COMPLETED when all
  items are delivered or cancelled.
- All changes go through OrdersService.changeStage (canTransitionStage, OrderStageEvent, AuditLog,
  OrderStageChanged → email to customer).
- Customer order page shows stage photos.
- Cancel item + refund via Razorpay with role limits (SUPPORT ≤ ₹5,000).
```

**Done when:** one test order moves through every stage with photos, the
customer sees each update, and a QC fail loops back correctly.

---

## Step 10 — Hardening and compliance

```text
Harden the platform for launch:
- Rate limiting on auth-adjacent, quote and checkout endpoints.
- Audit log screen for SUPER_ADMIN; audit history panels on design and order pages.
- DPDP: consent capture at signup (terms, privacy, marketing opt-in), data export endpoint,
  account deletion (scrub PII, keep orders for accounting with anonymised user), privacy notice page.
- Policy pages: returns and alterations, shipping, terms, privacy, grievance officer contact.
- Sentry (or similar) error monitoring on api, web, admin, mobile.
- Staff MFA enforcement using Supabase MFA.
- Security review of every admin route's @Roles and every customer route's ownership check;
  write tests for anything missing.
```

**Done when:** a review of routes shows no endpoint without auth/role tests, and
policies are live on the site.

---

## Step 11 — Deploy

```text
Prepare production deployment:
- apps/web and apps/admin on Vercel (separate projects), env vars documented.
- apps/api on Railway or Render in the region closest to India, with a Dockerfile, health check,
  and `prisma migrate deploy` on release.
- Supabase abaya-prod: run migrations, create buckets, enable providers; Pro plan.
- Razorpay live keys and webhook URL (only after KYC is approved).
- EAS production builds for Android and iOS; store listing checklist (privacy labels, Data Safety,
  account deletion, screenshots).
Write docs/deploy.md with every step and command.
```

**Done when:** production URLs work end to end with a real ₹1 test product, then
remove the test product.

---

## Phase 2 (after the MVP has real orders)

| Step | Prompt summary |
| --- | --- |
| 12 | ~~Maker app~~ — replaced by the workshop Stitching station (`docs/apps/workshop.md`); tailors are added in Staff & roles |
| 13 | WhatsApp order updates (Gupshup/Interakt) + push notifications |
| 14 | Shiprocket integration: labels, pickup, tracking webhooks |
| 15 | ✅ `services/ai` (CLIP): fingerprints + tag suggestions; duplicate detection in review (in-memory similarity instead of pgvector, Postgres queue instead of BullMQ — ADR 0005) |
| 16 | Pinterest integration: OAuth, board sync → ImportJob → Reference (after Pinterest approves the app) |
| 17 | AI tech pack drafts with human approval |
| 18 | Redesign preview (AI render) and virtual try-on |
| 19 | Measurement from photos |
| 20 | Automatic maker routing by skills, capacity, rating |
