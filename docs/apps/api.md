# Backend — `apps/api`

NestJS 10 on Node 22, TypeScript strict, Prisma (`@abaya/db`), Zod validation
(`@abaya/contracts`), `@nestjs/event-emitter` for domain events,
`@nestjs/throttler`, `@nestjs/config` with a Zod-validated env, `pino` logging.
Port **4000**.

## Structure

```
apps/api/src/
├─ main.ts                    # bootstrap, CORS, helmet, global pipes/filters, /v1 prefix
├─ app.module.ts
├─ common/
│  ├─ auth/                   # SessionAuthGuard (Clerk), RolesGuard, @Public, @Roles, @CurrentUser
│  ├─ config/                 # env schema (Zod) + typed ConfigService
│  ├─ errors/                 # DomainError base, global exception filter → apiError shape
│  ├─ prisma/                 # PrismaService (wraps @abaya/db client), transaction helper
│  ├─ storage/                # Supabase storage client: signed upload/download URLs
│  ├─ audit/                  # AuditService.record(actor, action, entity, before, after)
│  └─ zod/                    # ZodValidationPipe, @ZodBody/@ZodQuery decorators
└─ modules/
   ├─ identity/  catalog/  pricing/  customer/
   ├─ orders/    payments/ production/  notify/
   └─ (Phase 2) integrations/  shipping/
```

Each module follows `domain / application / infrastructure / interface`
(see `docs/architecture.md` §4).

## Module contracts (exported application services)

- `PricingService.quote(input) → PriceBreakdown` — loads design, allowed options,
  values and size band; calls `calculatePrice()` from contracts.
- `CatalogService.getPublishedDesign(id)`, `CatalogService.snapshot(designId)`.
- `CustomerService.getMeasurementSnapshot(userId, profileId)`.
- `OrdersService.changeStage(itemId, to, actor, note?, photoPath?)` — the ONLY way
  to change a stage: checks `canTransitionStage`, writes `OrderStageEvent` +
  `AuditLog`, emits `OrderStageChanged`.
- `PaymentsService.createRazorpayOrder(order)`, `.verifySignature(...)`,
  `.handleWebhook(rawBody, signature)`.

## Domain events

| Event | Emitted by | Handled by |
| --- | --- | --- |
| `DesignPublished` | catalog | (Phase 2) search index |
| `PaymentCaptured` | payments | orders → `Order.status = PAID`, items stay `PLACED`, `placedAt` set |
| `OrderStageChanged` | orders | notify (email/WhatsApp), orders (complete order when all items done) |
| `RefundProcessed` | payments | orders, notify |

## Testing

- Unit: domain entities and use cases with in-memory repository fakes.
- E2E: Nest testing module against a separate Supabase dev database (or a local
  Postgres) — at minimum: publish flow, quote, checkout → webhook → PAID,
  stage transitions, role guards (403 cases).
- Webhook tests use Razorpay's documented signature algorithm with a test secret.
