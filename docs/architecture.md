# System architecture

## 1. Overview

```
 Customer web (Next.js)   Customer app (Expo)   Admin panel + /workshop (Next.js)
            \                    |                     |                     /
             \___________________|_____________________|____________________/
                                         |
                              HTTPS  /v1  REST + JSON
                                         |
                         apps/api  — NestJS modular monolith
     ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
     │ identity │ catalog  │ pricing  │ customer │ orders   │ payments │production│ notify   │
     │          │          │          │ (measure,│          │          │ (QC,     │          │
     │          │          │          │  cart)   │          │          │  makers) │          │
     └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
                     |                 |                   |                 |
           Supabase Postgres    Supabase Storage     Razorpay        services/ai (Phase 2)
           (Prisma)             (signed URLs)        (webhooks)      FastAPI + GPU
```

- One backend (`apps/api`) owns all business rules and all database access.
- Four clients share one typed API contract (`@abaya/contracts`).
- Supabase supplies Postgres, Auth and Storage; our API is the only server that
  talks to them with privileged keys.

## 2. API modules

Each module = `domain/`, `application/`, `infrastructure/`, `interface/`.

| Module | Owns (tables) | Responsibilities | Phase |
| --- | --- | --- | --- |
| `identity` | `User`, `Address`, `ConsentRecord` | Verify Clerk session token, create/load our user, roles, profile, addresses, consent, data export/delete | 1 |
| `catalog` | `Design`, `DesignImage`, `DesignOption`, `Reference`, `Collection` | Designer uploads, review queue, status transitions, tags, publish/archive, public catalog + search | 1 |
| `pricing` | `OptionGroup`, `OptionValue`, `SizeBand` | Option catalog with surcharges, size bands, price quote endpoint (price history via `AuditLog`) | 1 |
| `customer` | `MeasurementProfile`, `Cart`, `CartItem`, `WishlistItem` | Measurements, saved redesigns (cart items with chosen options), wishlist | 1 |
| `orders` | `Order`, `OrderItem`, `OrderStageEvent` | Place order from cart, snapshot price + options + measurements, stage machine, cancellations, remakes | 1 |
| `payments` | `Payment`, `Refund` | Razorpay order creation, signature verification, webhooks, refunds | 1 |
| `production` | `Maker`, `Assignment`, `TechPack`, `QcCheck`, `MakerPayout` | Tech pack approve, assign to tailor, workshop stations, QC pass/fail, payouts | 1 |
| `notify` | `Notification` | Email / WhatsApp / push on order events | 1 (email) / 2 (WhatsApp, push) |
| `audit` | `AuditLog` | Append-only log of sensitive actions | 1 |
| `ai` | `AiImage` | Image fingerprints (duplicate detection) and tag/style/alt-text suggestions via `services/ai`; Postgres job queue; in-memory similarity (ADR 0005) | 2 (Step 15) |
| `integrations` | `ExternalSource`, `ImportJob` | Pinterest OAuth + board sync, fashion API adapters → `Reference` rows | 2 |
| `shipping` | `Shipment` | Shiprocket labels, tracking webhooks | 2 |

Module communication: synchronous calls through exported application services
(e.g. `orders` calls `pricing.quote()`), and in-process domain events via
`@nestjs/event-emitter` (e.g. `PaymentCaptured` → `orders` moves to `PLACED`,
`OrderStageChanged` → `notify`). Background work (notifications, AI image
analysis) uses Postgres job tables leased with `FOR UPDATE SKIP LOCKED`; no Redis.

## 3. Key flows

### 3.1 Catalog intake → published design

```
Designer upload (admin panel)            Pinterest / API import (Phase 2)
   │ POST /v1/admin/designs                 │ ImportJob → Reference rows (IMPORTED)
   │ images via signed upload URL           │ catalog manager reviews → NEEDS_DESIGN
   ▼                                         ▼ (assigned to a designer)
 Design DRAFT ──► IN_REVIEW  ◄──── designer creates an ORIGINAL design from the reference
   │ catalog manager: tags, allowed options, base price, size bands
   │ (or CHANGES_REQUESTED back to the designer)
   ▼
 PRICED ──► publish ──► PUBLISHED (visible on web + app) ──► ARCHIVED
```

Every transition is a use case in `catalog/application` that checks the role and
writes `AuditLog`.

### 3.2 Redesign → checkout

1. Customer opens a published design; client loads allowed option groups.
2. As options change, client calls `POST /v1/pricing/quote` (or computes locally
   with `calculatePrice()` for instant feedback; the server quote is authoritative).
3. "Add to bag" stores `CartItem { designId, selectedOptionValueIds, sizeBandId | measurementProfileId }`.
4. Checkout: API re-quotes every item, creates `Order` with a **price and option
   snapshot**, creates a Razorpay order, returns its id.
5. Client completes Razorpay; webhook `payment.captured` → `payments` verifies
   signature → emits `PaymentCaptured` → order stage `PLACED`.

### 3.3 Order lifecycle (per order item — one abaya)

`PLACED → SPEC_APPROVED → ASSIGNED → CUTTING → STITCHING → QC → SHIPPED → DELIVERED`

- `SPEC_APPROVED`: production manager approves the tech pack (Phase 1: a form in
  admin; Phase 2: AI draft + approve).
- `ASSIGNED`: production manager picks a maker (Phase 2: suggested automatically).
- `CUTTING`, `STITCHING`: maker uploads a stage photo (Phase 1: staff uploads on
  the maker's behalf in admin).
- `QC`: QC fails → back to `STITCHING` with notes; passes → ready to ship.
- `SHIPPED`/`DELIVERED`: tracking number entered (Phase 2: Shiprocket webhooks).
- Every change inserts an `OrderStageEvent` and emits `OrderStageChanged`.

## 4. Folder layout of an API module

```
apps/api/src/modules/catalog/
├─ domain/
│  ├─ design.entity.ts          # Design aggregate + invariants (status transitions)
│  ├─ design-status.ts          # allowed transitions table
│  ├─ design.errors.ts
│  └─ design.events.ts          # DesignPublished, DesignArchived
├─ application/
│  ├─ ports/
│  │  ├─ design.repository.ts   # interface
│  │  └─ image-storage.port.ts  # interface
│  ├─ create-design.use-case.ts
│  ├─ submit-for-review.use-case.ts
│  ├─ publish-design.use-case.ts
│  └─ list-public-designs.query.ts
├─ infrastructure/
│  ├─ prisma-design.repository.ts
│  └─ supabase-image-storage.adapter.ts
├─ interface/
│  ├─ admin-designs.controller.ts   # /v1/admin/designs
│  ├─ public-designs.controller.ts  # /v1/designs
│  └─ dto/                          # thin wrappers around @abaya/contracts Zod schemas
└─ catalog.module.ts
```

Shared API infrastructure lives in `apps/api/src/common/`:
`auth/` (Clerk session guard, `@Roles()` decorator, `RolesGuard`),
`zod/` (validation pipe), `errors/` (exception filter → error format),
`prisma/` (PrismaService), `storage/` (Supabase storage client),
`audit/` (AuditService), `config/` (typed env via Zod).

## 5. Security

- Auth: Clerk session token in `Authorization: Bearer`. `SessionAuthGuard` verifies it,
  then loads `User` by `authUserId`; first login creates a `CUSTOMER` user.
- Authorization: `@Roles(...)` + `RolesGuard` on every admin/maker route;
  ownership checks in use cases (customers see only their own orders).
- Storage: public bucket only for published design images; everything else in a
  private bucket read via signed URLs that expire in 10 minutes.
- Body photos used for measurement are deleted after measurements are saved
  unless the customer opts to keep them.
- Rate limits: `@nestjs/throttler` on auth-adjacent and quote endpoints.
- Staff accounts require 2FA (Supabase MFA) — enforced by guard for staff roles.
- Webhooks verify signatures (Razorpay) before any state change.
- DPDP (India): consent records, data export and account deletion endpoints,
  breach playbook; see the business plan.

## 6. Environments

| Env | Database | Web / admin | Mobile |
| --- | --- | --- | --- |
| local | Supabase project `abaya-dev` | localhost:3000 / :3001 | Expo Go on phone |
| production | Supabase project `abaya-prod` (Pro plan) | Vercel | EAS Build → Play Store / App Store |

API hosting (production): Railway, Render or AWS (ECS) in the Mumbai region.
CI: GitHub Actions runs `pnpm typecheck`, `pnpm test`, `pnpm lint` on every PR.
