# Workshop — `/workshop` in the admin website (`apps/admin`)

Every abaya is made by six stations, in order. Each station is a page under one route,
`/workshop`, of the admin website. It is responsive: phones, tablets and PCs.

| Station | Route | Role | Stages it owns | Its step |
| --- | --- | --- | --- | --- |
| Pattern | `/workshop/pattern` | `PATTERN_TECHNICIAN` | `SPEC_APPROVED`, `PATTERN` | Start pattern → confirm → `CUTTING` |
| Cutting | `/workshop/cutting` | `CUTTER` | `CUTTING` | Photo of cut pieces → `STITCHING` |
| Stitching | `/workshop/stitching` | `MAKER` (partner tailor) | `STITCHING` | Photo of stitched piece → `QC` |
| Quality check | `/workshop/qc` | `QC` | `QC` | Checklist: pass → `FINISHING`, fail → back to stitching, cutting or pattern |
| Finishing & packing | `/workshop/finishing` | `FINISHER` | `FINISHING` | Photo of packed parcel → `PACKED` |
| Logistics | `/workshop/logistics` | `LOGISTICS` | `PACKED`, `SHIPPED` | Courier + tracking → `SHIPPED`; → `DELIVERED` |

`PRODUCTION_MANAGER` and `SUPER_ADMIN` can open every station. Pattern and cutting can
put a job **on hold** with a question (`ON_HOLD`); it resumes at the same stage.

## Team (one person per station)

The production manager picks the **team** for each abaya on the admin order page
(**Assign team**): pattern technician, cutter, tailor (with the due date), QC and
finisher. The tech pack can only be approved once the team is complete
(`TEAM_INCOMPLETE`), so production never starts without it. Then:

1. Each station's job goes **only** to that station's person: it is in their "My jobs",
   and other people at the same station do not see it (404). Managers see everything.
2. The person presses **Start …** (the job is theirs; this records when work began). An
   assigned job cannot be handed back to a queue.
3. When they finish, the job lands with the next person automatically. A QC send-back
   returns to the person who did that station; a hold resumes with the same person.
4. **Change team** at any time until the abaya ships (sick leave, overload). If the job is
   at that station right now, a started job goes to the new person unstarted.
5. Logistics stays a shared dispatch queue. Items without a team (older orders) use the
   open queue at every station, as before.

`WorkshopAssignment` stores one row per station (`TEAM_STATIONS`); the tailor is the
item's maker. Every change is audited (`workshop.team_assigned`). Only the assigned QC
person (or a manager) may record the quality check (`NOT_ASSIGNED`).

## Staff login (one login page for everyone)

1. A super admin adds the person in **Staff & roles → Add staff**: email, name, station(s).
   Ticking **Tailor** also asks for the tailor's city (no phone needed; they sign in with email): the API creates their tailor
   record (`Maker`, for assigning jobs and payouts) through the `identity.tailor_added` event.
   Edit roles cannot add Tailor (no city field there); it can remove it.
2. The person opens the admin website's login page and signs in with that email
   (Clerk email code, which verifies the email).
3. On that first sign-in the API grants the invited roles (`StaffInvite`, audited);
   a tailor's login is linked to their tailor record (same email) on their first workshop request.
4. They are sent to their page (`staffHomePath` in `@abaya/contracts`):
   office roles → the admin dashboard; one station → that station; several → `/workshop`.
   Anyone else sees "This email is not registered as staff".

## Pages

All workshop pages use the admin panel's sidebar shell. The sidebar has a **Workshop**
section listing the person's stations with live job counts (amber when something is
overdue or on hold). Office staff also see the admin sections; workshop-only staff see
only their stations. On phones the sidebar is the menu button.

- **`/workshop`** — totals (waiting, my jobs, overdue, on hold), the stations as a
  production line in order, then:
  - **workers:** "My jobs now" across their stations (overdue first);
  - **super admin / production manager:** "Needs attention" (on hold, overdue, team not
    assigned) and **"Team at work"**: every team member with their jobs — working on it
    (started, with how long ago), not started, on hold, coming next — filterable by station
    and state, plus who is free. The "My jobs" tile becomes "In progress".
    (`GET /v1/workshop/overview`, managers only.)
  Someone with one station goes straight to it.
- **`/workshop/[station]`** — tiles (waiting, my jobs, overdue, on hold, done in 30 days),
  "What this station needs" (the station's steps, collapsible), and the tabs All · My
  jobs · Overdue · On hold · **Done**. Each job card: design, size, order number, due
  date, rework/overdue badges, who has it and since when, plus the brief — body
  measurements, chosen options and, at pattern, the pattern version with its four
  requirements (measurements, pieces, fabric, files) ticked or missing. **Done** lists
  the jobs finished at the station in the last 30 days (by the viewer; managers see
  everyone's and can open them), with where each job is now. Refreshes every 30 seconds.
- **`/workshop/item/[id]`** — the job card: design image, chosen options, measurements,
  approved tech pack and reference pictures, QC history, a photo timeline, and the
  station's buttons (take job / give back, the step, ask a question, resume, QC form,
  ship). Only Logistics sees the delivery address and phone number.

## Pattern station tools

On the job card while the item is at `PATTERN` (the technician who took the job, or a
production manager, may edit):

- **Measurements** — body (from the approved tech pack, else the order; typed in when
  missing) + **ease** (prefilled per style, `DEFAULT_EASE_CM`) = **finished** size.
- **Pieces** — prefilled from the style and options (`defaultPieces`), editable.
- **Fabric** — width (110 / 140 / 150 cm or other), metres needed (a **Suggest** button uses
  `suggestFabricLengthCm`), lining, seam allowance.
- **Files** — PDF or DXF (CAD) exports, or photos of a paper pattern (up to 25 MB each,
  private bucket, `pattern-files/`).
- **Notes for the cutter.**
- **Save draft** any time; **Confirm & send to cutting** needs bust + full length, at
  least one piece, fabric width + length and at least one file (`missingForCutting`).
  Confirming is audited (`pattern.confirmed`).
- **Versions** — a QC send-back to pattern (or a remake) starts version 2 from the last
  one; earlier versions stay readable.

Cutting, stitching (the assigned tailor), QC and later stations see the **confirmed**
pattern read-only on their job card, including the files. The admin order page shows the
latest version.

API: `GET /v1/workshop/items/:id/pattern` (the pattern, a prefill and what is missing),
`PUT /v1/workshop/items/:id/pattern` (save draft, `patternBody`), and upload files with
`POST /v1/workshop/uploads { contentType, purpose: 'PATTERN_FILE' }`.

## Cutting station tools

On the job card while the item is at `CUTTING` (the cutter who took the job, or a
production manager), below the confirmed pattern:

- **Fabric lot / roll number** (required) and a **colour check** against the order.
- **Metres used**, compared live with the pattern's estimate (`fabricVariancePercent`);
  more than **15 % over** (`FABRIC_OVERUSE_THRESHOLD`) needs a note. Leftover/wastage and
  lining metres are optional.
- **Pieces cut** — the pattern's piece list; every piece must be ticked.
- **Photo of the cut pieces** and **notes for the tailor**.
- **Cutting done: send to stitching** (`POST /v1/workshop/items/:id/cutting`, `cuttingBody`)
  records the cut (`CuttingRecord`, audited as `cutting.recorded`) and moves the item on.
  The bare step (workshop or admin) is refused with `USE_CUTTING_FORM`.
- **Re-cuts** — a QC send-back to cutting adds attempt 2, 3…; all attempts stay visible.

The tailor, QC and the admin order page see the cutting record (lot, metres vs estimate,
pieces, notes, photo).

## Stitching station tools

The tailor (MAKER, their own assigned items only) or a production manager:

- **Start stitching** takes the job and starts the clock (`claimedAt`); the job card shows
  "Started … ago" and **"This job pays ₹X"** (the design's making cost; only the tailor and
  managers see it). Finishing without starting is refused (`STITCHING_NOT_STARTED`,
  managers exempt).
- **Rework** — an item sent back by QC shows the last failed checks, notes and photos in red.
- **Checklist** from the tech pack and pattern (`stitchingChecklist`): body assembled,
  sleeves / cuffs (when the pattern has them), closure, one line per embellishment and
  add-on, hem at the finished length. Every line must be ticked.
- **Self-check** — full length, bust and sleeve length measured on the finished piece against
  the confirmed pattern's finished sizes (only the points the pattern has). Within 1 cm OK,
  up to 2 cm a warning, beyond 2 cm a note is required (`selfCheckLevel`).
- **Photo of the finished piece** and **notes for QC**.
- **Stitching done: send to QC** (`POST /v1/workshop/items/:id/stitching`, `stitchingBody`)
  records `StitchingRecord` (attempt 1, 2… after QC send-backs; audited as
  `stitching.recorded`) and moves the item to QC. The bare step (workshop or admin) is
  refused with `USE_STITCHING_FORM`.
- **Report a problem** (hold with `problemType`: missing piece, wrong size, fabric flaw,
  other; details; optional photo). The tailor then waits; the **production manager**
  chooses **Carry on stitching** or **Send back to cutting (re-cut)**
  (`/resume` with `to: 'CUTTING'`).
- **My earnings** on the stitching queue (tailors): pending, paid this month, paid in total
  and recent jobs (`GET /v1/workshop/earnings`). A payout is created when the piece passes QC.

QC and the admin order page see the stitching record (checklist, measurements against the
target, time taken, notes, photo).

## Rules (enforced by the API)

- Each job goes to the person on its team for that station (see "Team"); only they (or a
  manager) get its buttons. Without a team, a job is **taken** by one person at a time.
  Every stage change clears who started it.
- Tailors see only items assigned to their own tailor account.
- Customer name, email, phone and address are never sent to any station except
  Logistics. Workshop notes are never shown to customers.
- Workshop-only roles cannot read admin-panel data (`ADMIN_PANEL_ROLES`).

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/workshop/summary` | Counts per station for the caller |
| GET | `/v1/workshop/stations/:station/done` | Finished at the station, last 30 days |
| GET | `/v1/workshop/overview` | Managers: people with their jobs, idle people, on hold / overdue / team missing |
| GET | `/v1/workshop/stations/:station/items?view=all\|mine\|overdue\|on-hold` | The queue |
| GET | `/v1/workshop/items/:id` | Job card with the caller's allowed `actions` |
| POST | `/v1/workshop/items/:id/claim` · `/release` | Take / give back the job |
| POST | `/v1/workshop/items/:id/hold` `{ reason, problemType?, photoPath? }` · `/resume` `{ note?, to? }` | Pattern, cutting, stitching (problem report; the manager resumes or re-cuts) |
| POST | `/v1/workshop/items/:id/advance` `{ to, photoPath?, note? }` | The station's step; `{ item: null }` when it moved on |
| GET/PUT | `/v1/workshop/items/:id/pattern` | Pattern station: read / save the pattern draft |
| POST | `/v1/workshop/items/:id/cutting` | Cutting done (`cuttingBody`) → stitching |
| POST | `/v1/workshop/items/:id/stitching` | Stitching done (`stitchingBody`) → QC |
| GET | `/v1/workshop/earnings` | Tailor's pay (MAKER) |
| POST | `/v1/workshop/uploads` `{ contentType, purpose }` | Signed URL for a station photo |
| POST | `/v1/admin/order-items/:id/qc` | QC form (`sendBackTo` on a fail) |
| POST | `/v1/admin/orders/:id/ship` | Logistics ships packed items |
| PUT | `/v1/admin/order-items/:id/team` | Assign team (`teamBody`); required before tech-pack approval |
| GET | `/v1/admin/team-options` | People per station with their open jobs (Assign team pickers) |
| GET/POST/DELETE | `/v1/admin/staff-invites` | Super admin: add staff by email (tailors with `tailor: { city }`) |

## Later (not built yet)

Tailor time reports (hours per design, from stitching records), fabric stock (rolls in stock, metres deducted automatically), fabric-use reports per design
and cutter, packed weight and box size, Shiprocket labels (Step 14), printed QR job cards.
