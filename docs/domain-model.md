# Domain model

The Prisma schema in `packages/db/prisma/schema.prisma` is the source of truth
for tables. This document explains the rules around them.

## 1. Entities at a glance

| Area | Entities |
| --- | --- |
| People | `User` (roles on the user), `Address`, `ConsentRecord`, `Maker` |
| Catalog | `Reference` (inspiration only), `Design`, `DesignImage`, `DesignOption` (which options a design allows), `Collection` |
| Pricing | `OptionGroup`, `OptionValue`, `SizeBand` |
| Customer | `MeasurementProfile`, `Cart`, `CartItem`, `WishlistItem` |
| Orders | `Order`, `OrderItem`, `OrderStageEvent`, `Shipment` |
| Payments | `Payment` (for an order **or** an HD download), `Refund` |
| Downloads | `DesignDownload` (a customer's purchase of a design's HD images; snapshot of name, slug and image paths) |
| Production | `TechPack`, `QcCheck`, `MakerPayout` |
| Platform | `AuditLog`, `Notification`, `ImportJob` |

## 2. References vs designs

A **Reference** is an inspiration image from Pinterest, a fashion API or a manual
upload. It is never sold and never shown to customers.

```
Reference:  IMPORTED → IN_REVIEW → NEEDS_DESIGN → DESIGNED
                            └──────────────→ REJECTED
```

- `NEEDS_DESIGN`: catalog manager assigned it to a designer.
- `DESIGNED`: a designer created an original `Design` linked to it
  (`Design.referenceId`).
- Every reference keeps `sourceUrl` and `licenseNote`; Pinterest references must
  link back to the pin wherever shown in the admin panel.

A **Design** is our original abaya that can be sold.

```
Design:  DRAFT → IN_REVIEW → PRICED → PUBLISHED → ARCHIVED
                    │    ▲                ▲          │
                    ▼    │                └──────────┘ (re-publish)
            CHANGES_REQUESTED
```

| Transition | Who | Conditions |
| --- | --- | --- |
| DRAFT → IN_REVIEW | DESIGNER (own design), CATALOG_MANAGER | ≥ 1 image, name, style set |
| IN_REVIEW → CHANGES_REQUESTED | CATALOG_MANAGER | `reviewNotes` required |
| CHANGES_REQUESTED → IN_REVIEW | DESIGNER, CATALOG_MANAGER | — |
| IN_REVIEW → PRICED | CATALOG_MANAGER | base price set; ≥ 1 option allowed in every required group; ≥ 1 size band enabled |
| PRICED → PUBLISHED | CATALOG_MANAGER | primary image set |
| PUBLISHED → ARCHIVED | CATALOG_MANAGER | — (existing orders unaffected) |
| ARCHIVED → PUBLISHED | CATALOG_MANAGER | still passes PRICED checks |
| PUBLISHED → PRICED | CATALOG_MANAGER | "unpublish to edit price" |

Only `PUBLISHED` designs appear in public endpoints. Changing the base price or a
surcharge on a `PUBLISHED` design is allowed for `CATALOG_MANAGER` and is logged
to `AuditLog` with before/after values.

Design attributes: `name`, `slug`, `description`, `style`
(`CLOSED | OPEN_FRONT | BUTTERFLY | KIMONO | BISHT | KAFTAN | OTHER`), `tags[]`,
`basePriceInPaise`, `makingCostInPaise` (internal), `leadTimeDays`, images.

## 3. Options and pricing

**Option groups** (seeded; admin can add values, not groups, in Phase 1):

| Code | Selection | Required | Example values |
| --- | --- | --- | --- |
| `FABRIC` | single | yes | Nida, Crepe, Chiffon, Linen, Jersey, Satin |
| `COLOUR` | single | yes | Black, Navy, Olive, Beige, Maroon, Dusty Pink |
| `PATTERN_COLOUR` | single | no | Gold, Antique gold, Silver, Copper, Rose gold, Tone-on-tone (the embroidery / border colour; offered only by embroidered designs) |
| `SLEEVE` | single | yes | Straight, Bell, Cuffed, Elastic, Wide |
| `EMBELLISHMENT` | multi | no | Cuff embroidery, Front lace, Back stonework, Piping |
| `CLOSURE` | single | yes | Buttons, Snaps, Zip, Open |
| `ADD_ON` | multi | no | Matching hijab, Shayla, Inner slip, Belt |

Each `OptionValue` has `surchargeInPaise` (≥ 0). A design allows a subset of
values through `DesignOption`, which can override the surcharge for that design
and mark one value per group as the default.

**Size bands**: `XS, S, M, L, XL, XXL, CUSTOM`, each with `adjustmentInPaise`
(e.g. XXL +₹200, CUSTOM +₹300). Ordering with a `MeasurementProfile` uses the
`CUSTOM` band.

**Price formula** (implemented once in `@abaya/contracts` → `calculatePrice`):

```
unitPrice = design.basePrice
          + Σ surcharge(selected option values)    // design override if present
          + sizeBand.adjustment
lineTotal = unitPrice × quantity
```

- All amounts are integer paise. No percentages in Phase 1, so no rounding.
- Prices shown to customers are GST-inclusive. The GST split is computed when
  the invoice is generated (confirm HSN code and rates with a CA before launch).
- Selection rules (`validateSelections`): every required group has exactly one
  value; single-select groups have at most one; every value must be allowed for
  the design; values must be active.
- The API always recalculates; a client-sent price is ignored.

## 4. Measurements

`MeasurementProfile` (a customer can have several, e.g. "Me", "Mom"), in cm with
one decimal: `heightCm`, `bustCm`, `waistCm`, `hipCm`, `shoulderCm`,
`sleeveLengthCm`, `fullLengthCm` (shoulder to floor), `wristCm` (optional),
`notes`. `source`: `MANUAL | PHOTO_SCAN` (Phase 2). Validation ranges live in
`@abaya/contracts` (`measurementSchema`).

At checkout the chosen profile is **copied** into `OrderItem.measurementsSnapshot`
so later edits never change an order in production.

## 5. Orders

- `Order.status`: `PENDING_PAYMENT → PAID → COMPLETED`, or `CANCELLED`, `REFUNDED`.
- An order is **placed** when its payment is captured (`placedAt` set). A checkout that is never
  paid — the payment window could not open, or it was still `PENDING_PAYMENT` after
  `CHECKOUT_EXPIRY_HOURS` (24 h, hourly sweep) — becomes `CANCELLED` with no `placedAt`:
  **"Payment not completed"** (`isPaymentNotCompleted`). It is hidden from the customer's orders,
  left off the production board, and not counted in customer totals; the admin sees it in grey.
  A payment that still arrives later is accepted and places the order.
- Each `OrderItem` is one abaya being made and has its own production `stage`:

```
PLACED → SPEC_APPROVED → PATTERN → CUTTING → STITCHING → QC → FINISHING → PACKED → SHIPPED → DELIVERED
                            ▲          ▲          ▲       │
                            └──────────┴──────────┴───────┘  QC fail → the station that caused it
SPEC_APPROVED / PATTERN / CUTTING → ON_HOLD (a question) → back to the same stage.
Any stage before SHIPPED → CANCELLED (with refund). DELIVERED → REMAKE → PATTERN or CUTTING.
```

- Each stage belongs to a **workshop station** (docs/apps/workshop.md): pattern
  (`SPEC_APPROVED`, `PATTERN`), cutting, stitching, QC, finishing, logistics
  (`PACKED`, `SHIPPED`). A station takes a job (`claimedById`) so two people never
  work the same abaya; every stage change hands it back.
- Photos are required for the cut pieces (CUTTING → STITCHING), the stitched piece
  (STITCHING → QC) and the packed parcel (FINISHING → PACKED).
- The tailor (maker) is assigned by the production manager at any point from
  `SPEC_APPROVED` until stitching is done; it is not a stage. The tailor is alerted
  when the cut pieces reach `STITCHING`. `ASSIGNED` is the old flow's stage, kept only
  so history stays readable (items were moved to `PATTERN`).
- Customers see a simplified flow (`CUSTOMER_STAGE_FLOW`): finishing counts as the
  quality check, holds and remakes show as the pattern step, and workshop notes stay
  internal (only tracking numbers and cancellation/remake reasons are shown).

- `OrderItem` stores snapshots: `designSnapshot`, `optionsSnapshot`,
  `measurementsSnapshot`, `priceBreakdown`, `unitPriceInPaise`.
- Every stage change inserts `OrderStageEvent` (from, to, actor, note, photo).
- `Order.status` becomes `COMPLETED` when every item is `DELIVERED` or `CANCELLED`.
- Order numbers are human-friendly: `AB-2026-000123`.

## 6. Roles and permissions

Workshop station roles (in-house staff, docs/apps/workshop.md): `PATTERN_TECHNICIAN`,
`CUTTER`, `FINISHER`, `LOGISTICS`, plus `QC` (QC station) and `MAKER` (tailors: stitching
station, own assigned jobs and earnings only; added in Staff & roles with their city,
which creates their `Maker` record). They work in `/workshop` of the admin website and use
`/v1/workshop/*`; they cannot read admin-panel data. Only `LOGISTICS` (and managers) see the
customer's phone and address. `PRODUCTION_MANAGER` and `SUPER_ADMIN` can open every station.
Staff are added by email (`StaffInvite`); the roles are granted on their first sign-in.
Each abaya has a workshop **team** (`WorkshopAssignment`: pattern, cutting, QC, finishing; the
tailor is `OrderItem.makerId`), picked before the tech pack is approved; each station's job
goes only to its person (docs/apps/workshop.md "Team").

| Capability | SUPER_ADMIN | CATALOG_MANAGER | PRODUCTION_MANAGER | DESIGNER | QC | SUPPORT | MAKER | CUSTOMER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Manage staff and roles | ✓ | | | | | | | |
| Settings, payment config | ✓ | | | | | | | |
| Create/edit own designs | ✓ | ✓ | | ✓ | | | | |
| Review, price, publish designs | ✓ | ✓ | | | | | | |
| Manage options, size bands | ✓ | ✓ | | | | | | |
| Manage references / imports | ✓ | ✓ | | view assigned | | | | |
| View all orders | ✓ | ✓ | ✓ | | ✓ | ✓ | | |
| Approve tech pack, assign tailor | ✓ | | ✓ | | | | | |
| Record QC result | ✓ | | ✓ | | ✓ | | | |
| Cancel order / refund ≤ ₹5,000 | ✓ | | | | | ✓ | | |
| Refund > ₹5,000 | ✓ | | | | | | | |
| See customer phone/email/address | ✓ | | ✓ | | | ✓ | | own |
| See own assigned items, upload stage photos (stitching station) | | | | | | | ✓ | |
| Browse, redesign, order, track own orders | | | | | | | | ✓ |

A user can hold several roles (`User.roles` is an array). Staff roles require MFA.

## 7. Audit log

Append-only `AuditLog { actorUserId, action, entityType, entityId, before, after, ip, createdAt }`.
Required actions: `design.status_changed`, `design.price_changed`,
`option.surcharge_changed`, `order.stage_changed`, `order.cancelled`,
`refund.created`, `user.roles_changed`, `maker.payout_marked_paid`.
