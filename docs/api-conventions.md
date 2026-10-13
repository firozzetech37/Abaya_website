# API conventions (`apps/api`)

## Basics

- Base path `/v1`. JSON only. Plural nouns: `/v1/designs`, `/v1/orders/:id`.
- Public customer routes: `/v1/...`. Staff routes: `/v1/admin/...`. Workshop routes (stations, tailors included): `/v1/workshop/...`.
- Request bodies and query strings are validated with the Zod schemas in
  `@abaya/contracts` through a global `ZodValidationPipe`.
- Money fields end in `InPaise` and are integers. Dates are ISO-8601 UTC strings.
- IDs are UUIDs. Customers see `orderNumber`, never internal IDs, in the UI.

## Auth

- Header: `Authorization: Bearer <Clerk session token>` (`getToken()` in the apps).
- `SessionAuthGuard` verifies it with Clerk (`CLERK_SECRET_KEY`, or networkless
  with `CLERK_JWT_KEY`), rejects browser tokens whose `azp` is not one of our
  origins, reads `sub` (Clerk user id), loads `User` by `authUserId`, and creates
  a `CUSTOMER` user on first sight (email/phone from Clerk).
- Staff MFA: Clerk's `fva` claim; staff routes answer 403 `MFA_REQUIRED` without
  a second factor when `STAFF_MFA_REQUIRED` is on (default in production).
- `@Public()` marks routes that need no login (catalog browsing, quote, webhooks).
- `@Roles('CATALOG_MANAGER', 'SUPER_ADMIN')` + `RolesGuard` on every admin route.
- The current user is available via `@CurrentUser()`.

## Errors

Every error has this shape (`apiError` in contracts):

```json
{ "error": { "code": "DESIGN_NOT_PUBLISHED", "message": "This design is not available.", "details": {}, "requestId": "..." } }
```

| HTTP | When | Example code |
| --- | --- | --- |
| 400 | Validation failed | `VALIDATION_FAILED` (details = Zod issues) |
| 401 | Missing/invalid token | `UNAUTHENTICATED` |
| 403 | Wrong role or not the owner | `FORBIDDEN` |
| 404 | Not found (or not visible to this user) | `NOT_FOUND` |
| 409 | Invalid state transition, duplicate | `INVALID_TRANSITION`, `ALREADY_EXISTS` |
| 422 | Business rule broken | `INVALID_OPTION_SELECTION`, `PRICE_NOT_SET` |
| 429 | Rate limited | `RATE_LIMITED` |
| 500 | Unexpected | `INTERNAL` (never leak stack traces) |

Domain errors are plain classes in `domain/*.errors.ts`; the global exception
filter maps them to the table above.

## Pagination

Cursor-based: `?limit=24&cursor=<opaque>` → `{ items: [...], nextCursor: string | null }`.

## Endpoint map (Phase 1)

### Public / customer

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/v1/designs` | public | List published designs (`listDesignsQuery`) |
| GET | `/v1/designs/:slug` | public | Design detail with options and size bands (`designDetail`) |
| GET | `/v1/collections` | public | Active collections |
| GET | `/v1/announcements?lang=` | public, cached 60 s | Top-bar messages live now, in that language |
| POST | `/v1/pricing/quote` | public | Price for a design + options + size (`quoteBody` → `PriceBreakdown`) |
| GET | `/v1/me` | customer | Profile + roles |
| PATCH | `/v1/me` | customer | Update name/phone |
| GET/POST/PATCH/DELETE | `/v1/me/addresses[/:id]` | customer | Addresses |
| GET/POST/PATCH/DELETE | `/v1/me/measurements[/:id]` | customer | Measurement profiles |
| GET/POST/DELETE | `/v1/me/wishlist[/:designId]` | customer | Wishlist |
| GET | `/v1/cart` | customer | Cart with fresh quotes per item |
| POST | `/v1/cart/items` | customer | Add redesigned item (`addCartItemBody`) |
| PATCH/DELETE | `/v1/cart/items/:id` | customer | Change quantity / remove |
| POST | `/v1/checkout` | customer | Create order + Razorpay order (`checkoutBody` → `checkoutResponse`) |
| POST | `/v1/payments/verify` | customer | Verify Razorpay signature after client success |
| POST | `/v1/payments/webhook` | public (signature) | Razorpay webhook |
| GET | `/v1/orders` | customer | Own orders |
| GET | `/v1/orders/:orderNumber` | customer | Order with item stages + stage photos (signed URLs) |
| POST | `/v1/me/data-export` | customer | DPDP: request export |
| POST / DELETE | `/v1/me/devices[?token=]` | logged in | Register / remove an Expo push token (`registerDeviceBody`; `app: MAKER` needs the MAKER role) |
| DELETE | `/v1/me` | customer | DPDP: delete account |

### Admin

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/admin/uploads` | staff | Signed upload URL (`createUploadUrlBody`) |
| GET | `/v1/admin/designs` | staff | All designs, filter by status |
| POST | `/v1/admin/designs` | DESIGNER, CATALOG_MANAGER | Create draft |
| PATCH | `/v1/admin/designs/:id` | owner DESIGNER (draft only), CATALOG_MANAGER | Edit |
| POST | `/v1/admin/designs/:id/images` | same | Attach uploaded image |
| PUT | `/v1/admin/designs/:id/options` | CATALOG_MANAGER | Allowed options + overrides |
| POST | `/v1/admin/designs/:id/transition` | per table in domain-model | Status change |
| GET/POST/PATCH | `/v1/admin/options/values[/:id]` | CATALOG_MANAGER | Option values + surcharges |
| GET/PATCH | `/v1/admin/size-bands[/:id]` | CATALOG_MANAGER | Size band adjustments |
| POST | `/v1/studio/catalog/designs/:designId/{photoshoot,edits,reframe}` | DESIGNER, CATALOG_MANAGER | AI Catalog jobs from a design's main photo (Images tab → Make with AI); `GET …/jobs?designId=` lists them |
| GET/POST/PATCH | `/v1/admin/collections[/:id]` | CATALOG_MANAGER | Collections |
| GET/POST/PATCH/DELETE | `/v1/admin/announcements[/:id]` | CATALOG_MANAGER | Website top-bar announcements (EN + AR, dates, link) |
| POST | `/v1/admin/announcements/translate` | CATALOG_MANAGER | Arabic draft of an English message (Gemini, or the free MyMemory feed) |
| GET/POST/PATCH | `/v1/admin/references[/:id]` | CATALOG_MANAGER | References (manual upload in Phase 1) |
| GET | `/v1/admin/orders` | staff (not DESIGNER) | Orders, filter by stage |
| GET | `/v1/admin/orders/:id` | same | Full order incl. customer contact (role-gated fields) |
| PUT | `/v1/admin/order-items/:id/tech-pack` | PRODUCTION_MANAGER | Save / approve tech pack |
| PUT | `/v1/admin/order-items/:id/team` | PRODUCTION_MANAGER | Workshop team: one person per station + tailor and due date (`teamBody`); required before approving the tech pack |
| GET | `/v1/admin/team-options` | PRODUCTION_MANAGER | People per station with their open jobs |
| POST | `/v1/admin/order-items/:id/assign` | PRODUCTION_MANAGER | Assign / change the tailor (`assignMakerBody`); no stage change |
| POST | `/v1/admin/order-items/:id/stage` | PRODUCTION_MANAGER | Generic stage change (`stageChangeBody`) |
| POST | `/v1/admin/order-items/:id/qc` | QC | QC result (`qcCheckBody`): pass → FINISHING, fail → `sendBackTo` |
| POST | `/v1/admin/orders/:id/ship` | PRODUCTION_MANAGER, LOGISTICS | Ship packed items (`shipItemsBody`) |
| POST | `/v1/admin/orders/:id/refunds` | SUPPORT (≤ ₹5,000), SUPER_ADMIN | Refund (`refundBody`) |
| GET/PATCH | `/v1/admin/makers[/:id]` | PRODUCTION_MANAGER | Tailors: load, details (added via staff invites, not here) |
| GET | `/v1/admin/staff?role=` | CATALOG_MANAGER, PRODUCTION_MANAGER | Staff names for pickers |
| GET | `/v1/admin/users` | SUPER_ADMIN | Users |
| PUT | `/v1/admin/users/:id/roles` | SUPER_ADMIN | Change roles (`updateRolesBody`) |
| GET/POST/DELETE | `/v1/admin/staff-invites[/:id]` | SUPER_ADMIN | Add staff by email (`staffInviteBody`, tailors with their city); roles on first sign-in |
| GET | `/v1/admin/audit-logs` | SUPER_ADMIN | Audit trail |
| GET | `/v1/admin/dashboard` | staff | KPIs: orders by stage, revenue, late items |

### Workshop

The six production stations (`/workshop` in the admin website). Full list and rules in
`docs/apps/workshop.md`: `GET /v1/workshop/summary`, `GET /v1/workshop/stations/:station/items`,
`GET /v1/workshop/items/:id`, `POST /v1/workshop/items/:id/{claim,release,hold,resume,advance}`,
`POST /v1/workshop/items/:id/{pattern,cutting,stitching}`, `GET /v1/workshop/earnings`,
`POST /v1/workshop/uploads`. Roles: the station roles, `QC`, `MAKER` (tailors), `PRODUCTION_MANAGER`.

## Display currency

`GET /v1/pricing/rates` (public, cached 1 h) → `{ base: 'INR', rates: { AED }, fetchedAt, source: 'live' | 'fallback' }`.
Everything is priced, quoted, stored and charged in INR; the website converts for display only
(`formatMoney()` in `@abaya/contracts`). The rate comes from a free daily feed (`FX_RATE_URL`,
off in tests) and falls back to `FX_AED_PER_INR`.

## OpenAPI

Expose `/v1/docs` (Swagger UI) in development only. Generate DTO docs from the
Zod schemas (`nestjs-zod` or `zod-to-openapi`).
