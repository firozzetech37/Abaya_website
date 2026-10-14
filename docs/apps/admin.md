# Admin panel — `apps/admin`

Next.js 15, Tailwind, shadcn/ui (data tables, forms, dialogs), TanStack Query +
TanStack Table, react-hook-form + Zod. Login via Clerk (staff MFA with an authenticator app); only users with a
staff role get past the layout guard (and the API enforces it again). Port **3001**.

## Navigation by role

| Section | Roles | Screens |
| --- | --- | --- |
| Dashboard | all staff | Orders by stage, items due in 3 days, late items, today's revenue, designs awaiting review |
| Designs | DESIGNER (own), CATALOG_MANAGER | List by status tabs; editor; review; pricing; publish |
| References | CATALOG_MANAGER, DESIGNER (assigned) | Inspiration queue; assign to designer; reject (Phase 2 imports) |
| Options & sizes | CATALOG_MANAGER | Option values per group with surcharge, swatch, active; size bands |
| Designs list → row actions | CATALOG_MANAGER | On each published design: **Unpublish** (back to Priced, hidden from customers) and **Remove from catalog** (archive); on an archived one **Re-publish**. Each asks first; the same audited transitions as the design page. Tick several rows (published or archived; select-all in the header) and a bar at the bottom applies Unpublish, Remove from catalog or Re-publish to all of them at once, one audited transition each, reporting how many went through |
| Collections | CATALOG_MANAGER | Create, order, add designs |
| Announcements | CATALOG_MANAGER | The website's top-bar messages: English + Arabic text (the Arabic is drafted automatically from the English via `POST /v1/admin/announcements/translate`: Gemini when `GEMINI_API_KEY` is set, otherwise the free MyMemory feed; the editor checks it before saving), optional link, active switch, show-from / show-until dates, order. Live ones rotate on the site; with none live the bar is hidden |
| Orders | PRODUCTION_MANAGER, QC, SUPPORT | Kanban by stage + table view; order detail |
| Makers | PRODUCTION_MANAGER | Makers list, capacity, active items, payouts |
| Customers | SUPPORT, SUPER_ADMIN | Search, orders, contact (role-gated) |
| Staff & roles | SUPER_ADMIN | Invite by email, set roles |
| Audit log | SUPER_ADMIN | Filter by entity, actor, action |

## Key screens

**Design editor** (`/designs/[id]`)
- Tabs: Details · Images · Options & price · Preview.
- Images → **Make with AI**: a panel on the tab with the AI Catalog's three tools pointed at this
  design's main photo (the private original is copied to a catalog input): **On a model** (a saved
  model, optional direction; the master then close-up and side shots), **Edit** (one described
  change) and **Reframe** (another shape; 16:9 for the website's hero). Jobs remember the design
  (`CatalogJob.designId`; `GET /v1/studio/catalog/jobs?designId=`) and their results are listed in
  the panel with **Add to images** / **Add as main photo** (a pending image is approved first, in the
  same click) and a reject button, plus a colour tag, so nothing needs the Studio page. Same credits, limits, duplicate check and audit as the Studio. Needs a main photo.
  Routes: `POST /v1/studio/catalog/designs/:designId/{photoshoot,edits,reframe}`.
- Images: drag-and-drop → `POST /v1/admin/uploads` → PUT to signed URL →
  attach; reorder; set primary; **Colour shown** per photo (a COLOUR option value, the
  design's own colours listed first). Customers who pick that colour on the website see
  those photos; untagged photos are the main photoshoot, shown for every colour.
  **Detail close-up** per photo (`isDetail`): tick close-ups of fabric, embroidery or a hem;
  the website's craftsmanship gallery shows them instead of cropping full-length photos, and
  they are never used as a card's hover angle or primary photo.
- Options & price: for each group, checkboxes of allowed values, optional
  per-design surcharge override, one default per single-select group; base price
  and making cost (₹ input, stored as paise); live example price using
  `calculatePrice()`; margin shown to CATALOG_MANAGER.
- Status bar: current status + only the buttons allowed by `DESIGN_TRANSITIONS`
  and the user's role; "Request changes" asks for notes.

**Review queue** (`/designs?status=IN_REVIEW`): side-by-side reference image (if
any, with a link back to its source) and design images; approve to pricing or
request changes.

**Order detail** (`/orders/[id]`)
- Customer + address (role-gated), payment, items.
- Per item: design snapshot, chosen options, measurements snapshot, price
  breakdown, stage timeline with photos, actions allowed by
  `PRODUCTION_TRANSITIONS`: assign team (one person per station, tailor with due date; required before approval), approve tech pack,
  upload stage photo, QC checklist (pass/fail), mark shipped (carrier + tracking).
- Support actions: cancel item, refund (limit by role).

**Tech pack form** (Phase 1 manual, Phase 2 AI-drafted): style, fabric + colour,
sleeve/closure/embellishment details, measurements table (size band chart or
customer snapshot), construction notes, reference images. Printable view / PDF.

**Collections → Home-page video:** MP4 (H.264) or WebM, landscape, 8–15 s, up to 50 MB (1080p advised),
uploaded with purpose `COLLECTION_VIDEO` and copied to the public bucket on save. The Supabase
buckets must allow `video/mp4` and `video/webm`: run `pnpm --filter @abaya/db storage:setup`
once after upgrading (it is idempotent).

**Customer AI previews** (`/customer-previews`, catalog manager): pictures customers made
with "Preview my design" on the website and "a model like me" try-ons (badge; no photo of the
customer), today's previews, try-ons and FASHN credits against the daily limit, and **Hide** for a
bad preview. Customers see each picture for an hour; it stays here for
`CUSTOMER_AI_PREVIEW_KEEP_DAYS` (30) days, then shows "Deleted: pictures are kept 30 days" (its
credits still count). Try-ons on a customer's own photo are private, deleted after the hour and
never listed (docs/apps/web.md "AI preview and try-on").

**Check an image** (`/image-check`, catalog manager and super admin): upload (drop, paste or
choose) a picture found elsewhere; the API reads the invisible watermark (docs/apps/web.md "Image
protection") and says whether it is a catalog photo (which design, with its status) or a website
AI preview or try-on (which request, which customer, when, and the choices). "Our mark, but the
record is gone" when the design or request was deleted; "No Abaya Atelier mark found" otherwise.
The picture is uploaded to the private bucket (`image-checks/`, purpose `IMAGE_CHECK`) and deleted
as soon as it has been read. Reading searches over scale and position, about 2 seconds.
API: `POST /v1/admin/image-checks {path}` (module `image-check`, owns no tables).

**FASHN usage** (`/fashn-usage`, catalog manager and super admin): FASHN credits per person.
Tiles for today (website credits against `CUSTOMER_AI_DAILY_CREDIT_LIMIT`), the last 7 days and
this month, each split into website and Studio, plus the live FASHN balance and the per-person
Studio cap (`FASHN_DAILY_CREDIT_LIMIT`). A table lists everyone who used FASHN in the chosen
period (today, 7 or 30 days, this month, or custom dates up to 366, India days), with type
(customer or staff), previews, try-ons, Studio jobs, failed, remakes, credits and last used;
every column sorts, it filters by type and by name or email, and **Export CSV** downloads the
filtered rows. Clicking a person lists their jobs (newest first, up to 200) with design, status,
credits and the picture; a try-on never shows a picture, only its count and credits.
Counting rules: website requests count for the customer who asked, Studio jobs (AI Catalog,
Make with AI) for the staff member who started them; failed requests cost nothing, except a
website preview that failed the accuracy check twice; a shared preview costs the second customer
nothing; Studio credits are FASHN's reported count when it gave one, else the estimate.
API: `GET /v1/admin/fashn-usage?from&to`, `GET /v1/admin/fashn-usage/summary`,
`GET /v1/admin/fashn-usage/users/:userId/jobs?from&to`. The `fashn-usage` module owns no tables;
it asks the try-on, AI catalog, catalog and identity modules through their services.

## Rules

- Hide actions the user's role can't perform, but never rely on hiding: the API
  checks roles.
- Every destructive or money action asks for confirmation.
- Show `AuditLog` history on design and order pages.

**Money fields** (`MoneyInput`): amounts are cleaned as they are typed: digits and one decimal point
(two decimals at most), no sign or letters, leading zeros dropped. There is no business cap on amounts;
the only bound is the database's 32-bit column (`MAX_PAISE` in contracts, about ₹2.1 crore). Saving is still blocked while a field is invalid. `pnpm --filter @abaya/admin test`
runs the admin's unit tests (vitest, `lib/**/*.test.ts`).
