# Designer Studio (`apps/admin` → `/studio`)

The Studio is where our **in-house designers** create designs. There are no outside designers.
It lives in the admin website, like `/workshop`: same sign-in, same sidebar.

- A person whose only office role is `DESIGNER` lands on `/studio` after sign-in
  (`staffHomePath`). Their sidebar has: **Studio** (Home, AI Design, Inspiration) and their
  work (My designs, References).
- `CATALOG_MANAGER` and `SUPER_ADMIN` see the Studio section too, under the Dashboard.
- API: `/v1/studio/*`, roles `DESIGNER` and `CATALOG_MANAGER` (`SUPER_ADMIN` passes every check).
  Code: `apps/api/src/modules/studio`.

## Where a design comes from

| Source | How | `Design.source` |
| --- | --- | --- |
| Own work | "Upload a design": the designer's own photos (1–6) | `UPLOAD` |
| AI Design | Pick a variation → "Create design from this" | `AI_GENERATED` |
| Pinterest idea | Looked at only; the designer then makes an original design (own upload or AI) | as above, with `inspirationUrl` |

Every design then follows the normal flow: `DRAFT → IN_REVIEW → PRICED → PUBLISHED`.
**Submitting for review needs the originality statement** (checkbox: "This design is my own
original work …"). The API refuses `IN_REVIEW` without `originalityConfirmed: true`
(`ORIGINALITY_REQUIRED`) and stores `originalityConfirmedAt`. The review page shows the source,
the AI prompt and model, and the inspiration link.

## Home

Counts of my designs by status, average time from submit to approval, orders and revenue of
my designs (paid orders only), AI designs today, references assigned to me, the change requests
from the catalog manager, and recent AI designs.

## AI Design

1. The designer picks a style and optional choices (sleeves, fabric, colour, embellishment,
   closure, length, occasion: `GENERATION_CHOICES`), writes a description (10–600 characters),
   and can add **their own sketch** (upload purpose `DESIGN_SKETCH`; EXIF/location removed).
2. **Prompt filter** (`promptProblems` in `@abaya/contracts`, shared by form and API): no brand
   or designer names, no "worn by"/celebrity looks, no copy/replica/exact, no links. Refused
   with `PROMPT_NOT_ALLOWED`.
3. **Daily limit**: `AI_DAILY_LIMIT` (default 20) generations per designer per India day
   (`DAILY_LIMIT_REACHED`). Each makes `AI_IMAGES_PER_GENERATION` (default 4) variations.
4. The request is saved (`DesignGeneration`, audit `studio.generation_requested`) and a
   background worker (`GenerationWorker`, leased rows, 3 attempts with back-off) makes the
   images, one model call each. Images go to the private bucket (`GeneratedImage`).
5. The page polls until done. The designer can favourite variations and **create a draft
   design** from one: the image is copied into the design's photos and the design keeps a
   snapshot of the prompt and model (`Design.aiGeneration`).

**Model**: Nano Banana (`gemini-2.5-flash-image`, Google Gemini API, REST `generateContent`).
Set `GEMINI_API_KEY` to switch it on. Without a key the Studio runs in **test mode**:
placeholder silhouettes marked "Test image", so the whole flow can be tried. `AI_IMAGE_MODEL`
changes the model. The worker runs when `STUDIO_WORKER_ENABLED` (default on, off in tests).

What is sent to the model: the text prompt (choices + description + house rules: plain
background, no face, no text, no logo) and the designer's own sketch. **Never** a Pinterest image.

## Inspiration (Pinterest)

- **Paste a pin link** (`pinterest.com/pin/…` or `pin.it/…`): the API asks Pinterest's official
  oEmbed for the title, author and image address. The browser shows the image straight from
  Pinterest with a link back.
- **Company boards**: with `PINTEREST_ACCESS_TOKEN` (company account, API v5), the designer
  can browse the company's boards and pins.
- **Save to my references**: stores only the link, title and Pinterest's image address as a
  `Reference` (source `PINTEREST`, `NEEDS_DESIGN`, assigned to the designer). It is never
  analysed by the AI assistant and never shown to customers.
- **Use in AI Design**: the pin link is shown next to the results for comparing by eye.

Pin images are **never downloaded, stored, or sent to the AI**.

## AI Catalog (FASHN)

**Studio → AI Catalog** (`/studio/catalog`, API `/v1/studio/catalog/*`, module
`apps/api/src/modules/ai-catalog`): on-model catalog photos of an abaya made with
[FASHN](https://docs.fashn.ai). Test mode (placeholder images, no credits) until `FASHN_API_KEY`
is set.

| Step | FASHN endpoint | Notes |
| --- | --- | --- |
| **Master, one step (default)** | `product-to-model` | Abaya photo + described look (a new Middle Eastern face per abaya, shayla) + setting, in one call. Optional real face photo (`face_reference`, with consent, +3 credits) and the designer's own background photo (`background_reference`) |
| AI model (advanced) | `model-create` | Built prompt from the attributes + background; the chosen image is saved as a **model profile** ("Model 00N") and reused for every abaya |
| Personal model | (upload) | Full-body photo of a real person; saved only with the consent checkbox |
| Clean abaya photo | `background-remove` | Optional, 1 credit |
| Master, saved model (advanced) | `tryon-max` | Abaya photo + model profile photo (face, pose and background come from the profile) |
| Poses | `edit` on the **approved master** | Front, front 2, three-quarter, side, back, editorial. The back view gets the real back photo as `image_context`; without one it is flagged `BACK_CONSTRUCTION_UNVERIFIED` |
| Design edit | `edit` (+ painted `mask`) | The request is classified (fabric, colour, embroidery, sequins, sleeves…) and becomes a "change ONLY …, keep …" prompt |
| Reframe | `reframe` | e.g. 4:5 for the website |
| 4K final | same endpoint, `4k` + `quality`, same seed | Only from an approved image |

- **Sketch or photo:** the master can start from the designer's own **sketch** (sent as the
  product image with an instruction to make it a real, photographed abaya). **Design references**
  (fabric colour, print, embroidery, lace or trim, buttons, other; up to 6) carry a note each: the
  notes go into the master prompt, and each photo can be applied to the result with one design
  edit (FASHN `edit` with the photo as `image_context`, one reference per call).
- **Photoshoot ("Images" on a master):** one model, several shots. 1 = full body; 2 = + close-up
  (waist up); 3 = + left and right angles; 4 = + close-up, left and right. The full-body master is
  made first (one image), then each shot is a FASHN edit made from it, or from the last reference
  step when references are applied, so face, abaya, shayla and background stay the same. Cost:
  the master plus one edit per extra shot.
- **Styling:** framing for a realistic size in the scene (full body with setting by default:
  ~5–6 m away, matching perspective and contact shadows; or close full body / wide scene), a
  small handbag held at her side that never covers the embroidery (mini top-handle by default,
  or clutch, shoulder bag, none) and Gulf-style flat shoes (pointed leather flats by default).
  The default shayla is **coordinated** with the abaya: a complementing tone, not the same colour.
  Poses keep the same bag, shoes and scale; reject reasons "Scale or perspective wrong" and
  "Bag or shoes wrong" make the retry stricter.
- **References in practice:** FASHN sees only the product image in the master, so each reference
  needs a note. A note left empty is **filled automatically** from the photo by Gemini (vision,
  text only; works on the free key; `GEMINI_TEXT_MODEL`). With **"Apply references
  automatically"** (on by default when references have photos) the master is followed by one
  design edit per reference (fabric colour → print → embroidery → lace → closure → other), each
  waiting for the step before (`CatalogJob.afterJobId`) and starting from its image; if a step
  fails the rest are not made and cost nothing. Poses can be made from the approved last edit.
- **House look:** Middle Eastern (Arabian Gulf) models with natural warm olive / light-wheatish
  skin (not too fair, not too dark), always in a **shayla** (no hair visible). **A different model
  for each abaya**, the same model across that abaya's poses: "New model for this abaya" makes a
  new face each time (`varietyTraits`: face, eyes, brows, makeup, age 22–35), and a model that
  already wore another abaya shows "Worn for N abayas" with a nudge to use a new face.
- **Settings:** seven Arabian backgrounds (arches courtyard, desert golden hour, heritage old
  town, luxury majlis, modern Gulf, riad courtyard, marble palace) plus plain studio backdrops.
  They are described to the AI; designers may also upload their **own** background photo as the
  reference for a background edit. Pinterest images are never used.
- **Poses for the design:** the master records the abaya style and where the embroidery is;
  `suggestPoses` pre-ticks the poses that show it best (e.g. open front → walking step, butterfly
  → arms raised to open the wings, kimono → arms out and side view, back embroidery → back view)
  and `poseText` phrases each pose for that design.
- **Your direction:** designers add their own words on top of the house rules (garment
  protection stays), and save directions as **team presets** ("Eid golden hour").
- **The prompt is always visible and editable** before sending (built by `@abaya/contracts`
  `buildMasterPrompt` / `buildPosePrompt` / `buildEditPrompt` / `buildModelPrompt`).
- **Feedback:** every image can be approved or rejected (reasons required) with 1–10 scores
  (garment, fabric, embroidery, model realism, pose, background; overall = average). A rejected
  image can be tried again at most twice; each retry adds fixes for the reasons to the prompt.
- **Dataset:** each `CatalogJob` keeps inputs, prompt, endpoint, settings, seed, credits and
  status; each `CatalogImage` keeps the verdict, reasons, scores and note.
- **Credits:** cost shown before every run (FASHN table: 1–5 per image; face reference +3);
  `FASHN_DAILY_CREDIT_LIMIT` per designer per day; failed generations cost nothing.
- **Worker:** `CatalogWorker` sends queued jobs (max 6 at once, FASHN's limit), polls
  `/v1/status`, retries temporary failures, and **copies every result into the private bucket**
  (FASHN deletes its copies after 3 days). Inputs go to FASHN as 1-hour signed links.
- **Add to catalog:** an approved image is copied into a design's photos (shown to
  customers when published): to an existing design (optionally as the **main photo**) or as a
  **new draft design** (source AI, with the generation recorded for review). **Add the whole
  set** adds every approved image of a catalog set in order, with a starred main photo; it adds
  nothing if any chosen image is not approved, and skips images already in that design. Images
  in a design show **In catalog**. Both dialogs take an optional **Colour shown in the photo**
  (a COLOUR option value): customers who pick that colour on the website see those photos. A
  per-colour photoshoot is made once with **Edit** ("change the abaya colour to navy") and
  added as a set tagged with that colour; nothing is generated on the website.
- Model profiles are a shared team library; generations are visible to their designer and to
  the catalog manager.

## Later

Pricing templates, AI attribute tagging of new designs.
