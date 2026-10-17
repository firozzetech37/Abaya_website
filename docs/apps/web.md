# Customer website — `apps/web`

Next.js 15 (App Router), Tailwind, shadcn/ui, TanStack Query, Clerk
(`@clerk/nextjs`) for login. Server components fetch public catalog data; client components
handle redesign, cart and checkout. Port **3000**.

## Pages

| Route | Rendering | What it shows |
| --- | --- | --- |
| `/` | ISR (60 s) | Hero, collections reel, "The atelier edit" (new designs: arched cards with a "New arrival" tag for designs published in the last 30 days, the collection name, lead time and colour dots; on hover the card lifts onto a gold-edged panel with **Quick view** (a dialog: photos, colours, price, description, Customize) and **Customize this abaya**), "Explore silhouettes" (a gallery of tall arched tiles, one per style: the newest real photo of that cut, or an original gold line drawing of it that draws on as it scrolls in when there is no real photo yet; the number of designs, name, a line and an arrow pill that slides out on hover; a horizontal snap strip on phones; links to the filtered catalogue), craftsmanship, journey, closing invitation (a burgundy card with a double gold frame and mashrabiya, the newest real abaya in a gold-lined arch under the lantern, the promise in three points and the gold "Start designing" button) |
| `/abayas` | ISR + client filters | Grid of design cards; filters: style, collection, price; sort; infinite scroll |
| `/abayas/[slug]` | ISR (60 s) + client redesign panel | Gallery, name, from-price, description, **Redesign panel**, size or measurements, lead time, Add to bag |
| `/collections/[slug]` | ISR | Collection header + grid |
| `/bag` | client | Cart items with option summary and price breakdown, quantity, remove, subtotal |
| `/checkout` | client, login required | Address select/add → review → Razorpay → success |
| `/orders` | client, login required | Order list with status chips |
| `/orders/[orderNumber]` | client, login required | Per-item stage timeline with stage photos, shipment tracking, help button |
| `/account` | client | Profile, addresses, measurement profiles, wishlist, privacy (export/delete) |
| `/account/measurements/new` | client | Guided measurement form with diagrams per field and range hints |
| `/login` | server + client | The "atelier window": a tall arched photo slideshow of real published designs (a different one each visit, sticky beside the form) next to our own Playfair headline, Clerk's sign-in card (gold button, gold hairline; Clerk's own title hidden on the first step) and a trust row. When `redirect_url` points at a design page the headline becomes "Sign in to keep your design" with that abaya's thumbnail. Email code / Google; sign-up is the same form. |
| `/help`, `/policies/*` | static | FAQs, returns & alterations, shipping, privacy, terms, grievance officer |

## Redesign panel (the core component)

- **Two ways to order** (`components/design/redesign-panel.tsx`): two radio cards at the top,
  **Order as shown** (the photographed defaults, nothing to pick, only the size; the as-shown price
  is the card's "from" price) and **Customise it** (every option, price updating as you choose).
  "As shown" lists what the abaya comes with and a link to customise; switching back to "as shown"
  restores the defaults. Offered only when the defaults make a complete order. The chosen path is
  kept in the login draft. The order snapshot is the same either way.

- One section per option group, in `sortOrder`.
  - `COLOUR`, `PATTERN_COLOUR` (embroidery colour): round swatches (`colourHex`).
  - `FABRIC`, `SLEEVE`, `CLOSURE`: selectable cards with name and "+₹X".
  - `EMBELLISHMENT`, `ADD_ON`: multi-select checkboxes.
- Defaults pre-selected from `isDefault`.
- Price updates instantly using `calculatePrice()` locally, and is confirmed by
  `POST /v1/pricing/quote` (debounced 300 ms). If they differ, show the server price.
- Size: tabs "Standard size" (size band chips with bust ranges) / "My measurements".
  The customer types her measurements right there (the seven required ones with a diagram
  and a tip each, optional wrist, a profile name and notes for the tailor; same Zod schema
  as the guided form). Returning customers see their saved profiles as chips: picking one
  fills the form, edits are saved back to that profile, "New measurements" starts a fresh
  one. On "Add to bag" the API saves the profile (`POST`/`PATCH /v1/me/measurements`) and
  the item is added with `measurementProfileId`. Logged-out customers can fill everything
  in; at "Add to bag" the whole panel (options, size, measurements) is kept in
  sessionStorage, they log in, and the page restores it. Typed measurements show the local
  estimate; the server quote needs a saved profile.
- Colour photos: a design photo may be tagged with a COLOUR option value (admin Images tab,
  or "Add set" / "Add to catalog" in the AI Catalog). Picking a colour swaps the gallery to
  that colour's photos with a fade. With none, the untagged main photos stay and a note says
  which colour they show (the default colour). No image is generated on the website.
- Sticky mobile bar: total price + Add to bag.
- Phase 2: "Preview my redesign" button → AI render.

## Look and feel: Gulf palette and motion (Phase 2 of the redesign)

**Palette** (apps/web/tailwind.config.cjs): desert neutrals for the canvas (`sand` 50–500 and
a warm `neutral` scale: champagne page background, sand hairlines, warm taupe text), deep burgundy for the brand (`accent` 50–950,
`accent-700` = `primary` = `#6B1F2A`; dusty `rose` and `mauve` for secondary tones; the one muted green left is the `success` token for "done" states), jewel tones (`jewel.maroon`,
`.plum`, `.teal`, `.brick`) for highlights only (colour dots, seasonal tiles), antique gold
for ornaments. New ornaments in components/ornament/geometric.tsx: `MashrabiyaPattern` (the
carved screen, behind dark sections), `ArabesqueBorder` (vine along the footer), `Lantern`
(empty states, closing medallion).

**Fonts:** Playfair Display (display, English) + Inter; Amiri + IBM Plex Sans Arabic for Arabic.

**Motion** (Framer Motion, loaded lazily through `MotionProvider`; `m.*` only; every effect
respects "reduce motion" and animates transforms and opacity only):
- Hero (a full-width stage, text 5% from the edge): the headline's words rise out of their
  lines on first paint (`MaskedText`, a CSS animation so nothing is hidden without JS), set in
  large uppercase Playfair Display (up to 5 rem) in its own column on the start side, never
  crossing the photo card (the card takes the end half). A gold thread draws under "you"; the
  call to action is an antique-gold pill (`variant="gold"`: gold gradient, fine gold rim,
  burgundy-tinted shadow). The photo card
  is set into the stage like an editorial campaign (landscape 4:3 on wide screens, inset from
  the edges; portrait 4:5 on phones) with a thin gold arch drawn inside: a **slideshow** in
  which the newest looks dissolve into each other every 6 s, the current one slowly pushing in
  (`push-in`). A landscape photo (`DesignCard.wideImageUrl`, the first image wider than tall,
  e.g. made with **Reframe** in the AI Catalog) is used when the design has one; otherwise the
  portrait photo is shown from the top so the face and sleeves stay in frame. Nothing is drawn
  over the photo (no badge, arch, caption, thumbnails or hotspot): swipe on phones and arrow
  keys move between looks, and the photo is a quiet link to its design. A design with no photo,
  whose photo fails to load, or whose photo is known to be under 1000 px wide (it would be
  enlarged and go soft; `DesignCard.primaryImageWidth`) is dropped, unless it has a landscape photo.
  Pauses on hover, focus and hidden tabs; reduced motion: no sliding or push-in.
- Content column: 1440 px with 2.5 rem side padding on large screens (was 1240 px).
- UX rules applied (ui-ux-pro-max review): every control is at least 44 px (hotspot, progress
  tabs), pointer cursor on all clickable elements, at most two things moving at once in the
  hero (the strip and the headline; the badge sits still, the hotspot pulses only on hover),
  muted text keeps 4.5:1 contrast on champagne, reduced motion respected throughout.
- `ParallaxPattern`: the girih lattice drifts slower than the content and a gold glint
  travels across it (hero, numbers band, closing).
- Section titles rise out of a mask when scrolled into view (`data-reveal="mask"`).
- "The atelier in numbers" counts up when in view (`CountUp`).
- Product cards tilt towards the mouse with the lead-time tag floating above the photo
  (`TiltCard`, mouse only). On click the photo remembers where it was and flies into the
  design page's gallery (`lib/fly.ts`, `FlyImage`, imperative so markup never depends on
  sessionStorage).
- Journey: the seven steps as arched cards driven by the scroll. On wide screens the section
  pins for two and a half screens: scrolling down glides the rail from the first card to the
  last (a spring, a short hold at each end, a soft landing on the nearest card), scrolling up
  glides it back. The card nearest the first slot stands forward and plays its craft motion (a
  pencil drawing the silhouette, fabric rippling, pattern lines, scissors closing, a running
  stitch, a tick drawing itself, a box lid lifting); a running stitch under the rail shows where
  you are, the needle moving along it. Arrows, clicks and the keyboard scroll the page to a card.
  Phones and reduced motion: a free swipe strip with snap, no pinning. Pinned cards are sized by
  the viewport height (58 vh, max 640 px) so tall screens fill too. Each step can have its own
  picture: drop `public/journey/<nn>-<name>.jpg|webp` (README there lists the seven files); the
  page checks which exist at render time and the card falls back to a real design crop or a gold
  drawing until then.
- AI preview and try-on results develop from a pale print into the photo with a sparkle
  burst; a shimmering-fabric placeholder while they are made.
- Under the hero: Choose · Measure · Receive (`ThreeSteps`, replaces the old trust strip).
- Craftsmanship (`Craftsmanship`): six details the customer chooses and the atelier makes by hand
  (fabric, embroidery, sleeves, closure, finishing, fit) in a bento of mixed-size tiles that reveal
  in sequence. Each tile's picture is a **detail close-up** tagged in the admin (Images tab →
  "Detail close-up"; `DesignImage.isDetail`, `DesignCard.detailImageUrls`; never the card's hover
  angle or the primary photo) when any design has one, else a deep CSS crop of a real design photo
  (never an invented image). Hover: the tile lifts, a light sweeps across, the crop glides like a
  macro lens and the options that detail offers slide up (always shown on touch screens).
- Collections (`CollectionReel`): a cinematic reel. On wide screens the section pins to the
  viewport and one full-screen panel per collection glides sideways as the page scrolls (Framer
  `useScroll` on a tall track, a spring, `translateX` through a CSS variable so phones get a
  plain vertical stack with scroll-snap). Each panel shows the collection's looping **video**
  (`CollectionDto.videoUrl`, uploaded in Admin → Collections with purpose `COLLECTION_VIDEO`,
  copied to the public bucket on save; MP4/WebM, up to 50 MB) with no poster (the film fetches its first frame as soon as the page is up, more eagerly for the first panel on wide screens, and fades in from the dark ground once it is there; the cover photo stands in only on data-saver connections),
  or without one the cover photo slowly breathing with a light sweep and motes of dust. The
  name is cut out of the picture (white letters on a dark veil in `mix-blend-mode: multiply`,
  so the video shows through the letters), with a solid name, design count, description, up to
  three design photos (`previewImageUrls`) and "View collection" beneath. Videos load and play
  only while on screen, never with reduced motion or data-saver; reduced motion also un-pins
  the section. A "Skip the collections" link and tab-to-reveal keep it keyboard-friendly. The
  last panel is "Design your own": the headline (gold thread drawn under the last word), subline, detail chips revealing one by one and a brushed-gold CTA on the start half; the end half is a mood film (`apps/web/public/video/design-your-own.mp4`, atmosphere only: no caption, link or frame) filling it edge to edge with the same dark veil, floor shadow, light sweep and dust as the collection panels, and one soft burgundy seam towards the text; on phones it is a dim backdrop behind the text. Plays muted in view only, rests on its first frame for reduced motion or data saver; the middleware skips `.mp4`/`.webm` so public videos are served.
- Header: the arch monogram draws itself once on load (`@keyframes draw` lives in globals.css).
- Entrance curtain (`components/layout/curtain-loader.tsx` + `curtain-cloth.tsx`): two velvet
  burgundy curtains drawn by a WebGL fragment shader: pinch-pleated heading, wide uneven folds lit
  from the upper left with a velvet sheen and a slow passing highlight, the right drape overlapping
  the left at the seam with a cast shadow, a twisted gold braid down each leading edge, a hem tape
  and a fringe of threads swinging a beat behind the cloth; the cloth breathes in a draught, leans
  towards the pointer and ripples under it. Over it: a pleated valance with gold braid, scallops
  with gold trim and drops and an arabesque vine; gold tie-back tassels (cord, head, wrapped neck,
  skirt) on hooks at the sides; and in the middle a lantern glow, the brand mark drawing itself on
  two turning eight-point stars, and a welcome ("Welcome" / "أهلًا بكِ"). Choreography (3.8 s):
  the folds tighten for a moment, the curtains gather to the sides at a stage pace (sine easing)
  and the page shows through the gap as it widens (no light, rays, motes or glow of its own), the
  tassels swing as the cloth reaches them, the valance lifts away and the bunches are drawn off
  into the wings. A click, a key or a swipe opens
  early. From the first paint the curtains are a **still of the same scene**
  (`public/curtain/closed-{landscape,portrait}.webp`, rendered from the cloth's own shader by
  `pnpm --filter @abaya/web curtain:still`, preloaded in the layout, with a tiny inline placeholder
  in `app/curtain-tiny.css` under it); the live cloth starts from the same pose and fades in on
  top, and the still steps aside only once the cloth is fully there, so nothing changes to the
  eye (the cloth's own motion eases in from the still's pose; the fringe has a fixed number of
  strands so still and cloth share them at any width). The valance, tassels and star are there
  from the first paint; only the mark's draw-on, the welcome and the thread animate in. Without WebGL the still itself slides open; a fade for reduced motion. Re-run the script
  after changing the shader. No gate.
- **Preview my design:** at most two FASHN `edit` calls (1K fast, 1 credit each), each
  starting from the last result: first **colour and fabric only**, then the **visible details**
  (sleeves, embellishment, closure, add-ons; a matching hijab or shayla replaces the one she
  wears, a belt is in the abaya fabric). Every step tells FASHN to keep the design's
  silhouette and every existing embroidery panel exactly (the first version redrew the whole
  garment). Choices no photo can show (inner slip, hidden snaps, lining) are left out. It starts
  from the chosen colour's own photo when there is one (colour then costs nothing), else the main
  photo; choices the photo already shows (the design's defaults) are not asked for. Nothing
  visible changes: `422 NOTHING_TO_PREVIEW`.
- **Accuracy check:** Gemini vision (free key, `GEMINI_TEXT_MODEL`) compares the finished
  preview with the original photo against a checklist (silhouette, embroidery and colour are
  critical; at most one detail may be off). Fail: remade once with the problems named. Fail
  again: no picture, the customer reads "We couldn't make an accurate preview of this
  combination" and the combination is remembered (no new attempts until the admin hides it).
  No Gemini key or no answer: shown unchecked ("Not checked" in the admin).
- **In your words (optional):** a box under the options (`request`, max `PREVIEW_REQUEST_MAX`
  = 200 characters, English or Arabic). When she writes, **the picture is made from her words
  alone**: the chosen options are not used for the preview (they still drive the order and the
  price), the default photo is the canvas, and one edit step is run. Allowed: fabric look, fabric
  colour, the colour of the existing embroidery thread, background, setting, lighting, mood.
  Before any credit is spent Gemini splits the wish (`PreviewChecker.classifyRequest` →
  `{kept, leftOut}`): parts that would change the design (cut, length, sleeves, neckline, the
  pattern itself, lace, adding or removing an element such as accessories, the model herself)
  are dropped and listed back to her ("We left out: ..."); when nothing is allowed the API answers
  `422 REQUEST_NOT_ALLOWED`. The kept wish goes into the edit step with the same "keep the
  design" instructions and adds a non-critical check; `choices` stores "In her words: ..." and
  "Left out: ..." lines, and the DTO exposes `fromWords` and `leftOut` so the result says
  "Preview made from your words, not from your selected options". Shown only when
  `limits.wording` is true (a Gemini key is set); without a key the API answers
  `422 REQUEST_UNAVAILABLE`.
- **Shared:** the same design + options, or the same design + normalised words (`previewKey`),
  is made once; later customers get it free without using their allowance. Labelled
  "AI preview · approximate".
- **Her preview goes with her order (staff only).** When she adds an abaya to her bag, a private
  copy of her website AI preview of exactly those options (or, if she only made one from her own
  words, that one, marked "inspiration only") is kept with the bag item (`order-ai-previews/`),
  and at checkout the order item gets its own copy (`OrderItem.aiPreviewPath`). Try-ons are never
  kept (they show her). The admin order page and the workshop item page show it next to our
  design photo ("Approximate: make it exactly to the specification"); the customer's own order
  page never does. Her copy still disappears after its hour; the order's copy is deleted 90 days
  after the item is delivered or cancelled (`CheckoutExpiryService.deleteOldAiPreviews`).
- **Measurement fields** show their allowed range (the same as a saved profile, e.g. sleeve
  40–85 cm, shoulder to wrist) and are checked before anything is sent: a wrong value is marked
  in red with a plain message and costs no credit.
- **Try it on, two ways.** The dialog offers **My photo** (her full-length photo, as below) or
  **A model like me** (no photo: FASHN `model-create` makes an everyday woman with her build from
  her height, and optionally weight and bust/waist/hips, then `tryon-max` dresses that model).
  With her photo she can tick **Show it made to my measurements**: after the try-on an `edit`
  step shows the length and sleeves as the tailor cuts them (hem just above the floor, sleeves to
  the wrists; no pooling for petite heights). A saved measurement profile fills the fields in one
  tap. Each extra step is one more credit (both ways cost 2). Her numbers are only used to write
  the prompt: the build goes in as words (height in cm, never weight), nothing is saved to her
  profile, and the prompt is cleared with the picture after its hour. Steps can use different
  endpoints (`CustomerPreview.stepEndpoints`).
- **Try it on:** she agrees to the photo terms (the box sits right under the photo buttons) and
  picks or takes a full-length photo. **Photo check:** the moment both are done, the photo is
  uploaded (`POST /v1/me/try-on/uploads`, private bucket `tryon-photos/`), turned upright, its
  hidden data (GPS location) removed, and Gemini vision checks it strictly
  (`POST /v1/me/try-on/photo-check` → `{ ok, checked, problem }`): exactly one person, standing,
  whole body from head to feet, facing the camera, face not blocked (a hijab or niqab is fine),
  light and sharp. A photo that fails is deleted at once and she sees why under her photo
  (`TRYON_PHOTO_PROBLEMS`: sitting, cropped, half_body, not_facing, multiple_people, no_person,
  face_hidden, too_dark, blurry; English and Arabic), with "Choose another photo" and "Take a
  photo"; "Try it on" stays disabled meanwhile. A passed photo shows "Great photo" and is trusted
  by "Try it on" for 30 minutes (not checked again). When Gemini cannot answer the photo is
  allowed. "Try it on" still checks a photo that was not checked this way (`422
  PHOTO_NOT_SUITABLE`, nothing counted).
  FASHN `tryon-max` (1K fast) then puts the abaya on her: her customised preview when she made
  one, else the photo of her colour. The instruction transfers ONLY the abaya (never the
  product model's bag, shoes or headscarf) and keeps its silhouette and embroidery, and her
  face, body, pose, own headscarf and background. **Shown first, checked after:** she gets the
  try-on the moment FASHN is done (`checkNotes` "Checking"); Gemini then checks it with three
  pictures (the abaya, her photo, the result). Only serious problems are critical (another
  woman's face, her own clothes showing, the wrong silhouette, pattern or colour); details (every
  panel in its exact place, pose, fit, length) are noted for the admin, never remade. A serious
  problem makes a better one in the background (`improving: true`, status DONE with her first
  picture; the page keeps asking every 2 s and says "Making an even more accurate version"); it
  replaces hers once it passes (`improved: true`, "We improved your picture"). If it fails too,
  or cannot be made, she keeps the first (`mayDiffer: true`, "Some details may differ").
  **Ready-made models:** "a model like me" uses her height to the nearest 5 cm, and each made-up
  model is kept (`tryon-models/<hash>.jpg`, private) and reused for the next woman of the same
  height and build: no model step, 1 credit less. **Speed:** FASHN is asked every 1.5 s; the
  worker looks for work every second while pictures are being made (3 s when idle); Gemini gets
  at most 10 s for the photo check and background wording (20 s for the accuracy check), and is
  skipped for 10 minutes after "overloaded" or no answer. Only she can see a photo try-on (404
  for everyone else). She can delete it at once; otherwise it is deleted an hour after she got
  it.
- **Limits** (India day): `CUSTOMER_PREVIEW_DAILY_LIMIT` (20) and `CUSTOMER_TRYON_DAILY_LIMIT`
  (20) per customer, `CUSTOMER_AI_DAILY_CREDIT_LIMIT` (200) for all customers together. Failed
  pictures do not count.
- Pictures never change the order or the price: the order is made from the chosen options.
- Routes: `GET /v1/me/try-on/limits`, `POST /v1/me/try-on/previews`, `POST /v1/me/try-on/uploads`,
  `POST /v1/me/try-on/try-ons`, `GET|DELETE /v1/me/try-on/:id`. Admin (catalog manager):
  **Customer AI previews** page, `GET /v1/admin/customer-previews(/summary)`,
  `PATCH /v1/admin/customer-previews/:id {hidden}` (a hidden preview is never shown again and
  the next request makes a new one).

## HD download (web-size previews)

Every design image customers see is a **web-size preview**: max 1600px, JPEG, no metadata and
no visible watermark (removed at the owner's request). Previews are made when a design is published (or an image is added
to a live design) and are the only design files in the public bucket. Full-quality originals
stay in the private bucket. Images cannot be dragged or right-clicked; that is only a deterrent,
the smaller size is the protection. Super admin: Designs → **Rebuild website images** once
after this update (it also keeps a private copy of seed photos).

A design page offers **two ways** to have the design:

1. **Order the abaya** (main path, unchanged): we stitch it to the customer's measurements.
2. **Download the HD design** (only when the catalog manager turned on "Sell HD download" for the
   design; price set per design, default ₹299). The customer signs in, ticks the personal-use
   licence, and pays (Razorpay, or "Simulate payment" in test mode). This is its own purchase
   (`DesignDownload`, `/v1/me/downloads`); it never creates an order or a workshop job.

**My downloads** (`/downloads`, also in the account and menu) lists bought designs. Each click
makes a fresh 10-minute private link to a full-size JPEG; the file's
metadata carries the licence code (`L-…`) and a customer code (`C-…`), never name or email, so a
shared file can be traced. A design already bought cannot be bought again. Admin: **HD downloads**
page (catalog manager, support) with sales and revenue.

## Ordering coming soon

`ORDERING_ENABLED` (API `.env`, off unless set to `true`; tests run with it on) switches the bag,
checkout and HD downloads. While it is off:

- The website asks `GET /v1/ordering/status` (public) and shows nothing ordering-related until it
  knows. The product page keeps prices, customising, AI previews and try-ons, hides the size
  section, and shows **Ordering coming soon** in the price card (and the phone bar) with
  **Notify me when ordering opens**. The navbar and menu drop the bag; `/bag` and `/checkout`
  show a "coming soon" page; the HD download offer is hidden.
- The API refuses add-to-bag, checkout and HD download purchases with `422 ORDERING_CLOSED`
  ("Ordering opens soon…"), so nothing can be ordered around the website.
- "Notify me" (`POST /v1/me/ordering-waitlist`, idempotent; `GET` says whether she joined) adds
  her to `OrderingWaitlist`; signed out, she logs in first. Admin **Ordering waitlist**
  (`/waitlist`, support and catalog managers, `GET /v1/admin/ordering-waitlist`) lists name,
  email, mobile and date, with a CSV export.

To open orders: set `ORDERING_ENABLED=true` and restart the API.

## Image protection

No website can stop a screenshot (the device takes it, not the page), so pictures are protected
three ways instead:

- **Invisible watermark.** Every catalog web preview (made when a design is published; older ones
  were remade once at start-up, `DesignImage.previewGeneration` = `PREVIEW_GENERATION` 1) carries
  the design's id; every AI preview and try-on carries its request's id (marked when the result is
  saved, before she sees it). The mark is a faint blue-yellow and brightness pattern hidden by
  texture (about 40 dB, at most a few levels per pixel), 44 bits (kind, first 32 bits of the id,
  10-bit checksum) spread over a 24-column grid. It survives JPEG re-saves, ordinary screenshots
  (rescaled, roughly cropped, Retina) and a 15% crop; heavy cropping, filters or a photo of the
  screen can destroy it. Files also carry a copyright notice in their metadata (lost by
  screenshots). Module `watermark` (domain algorithm, `WatermarkService.mark/read`); the admin
  **Check an image** tool reads it (docs/apps/admin.md).
- **Visible watermark on AI pictures.** Website AI previews and try-ons (never catalog photos)
  also get a visible mark drawn into the file before the invisible one: a faint diagonal
  "Abaya Atelier · AI preview" (or "AI try-on") repeated across the whole picture, so it cannot be
  cropped away, and a corner badge with the brand arch, "Abaya Atelier" and "AI PREVIEW"
  (`domain/visible-mark.ts`). Saved files and screenshots show it.
- **No saving AI pictures.** Right-click "Save image", dragging the picture out and long-press
  "Save to Photos" are blocked on AI results (a clear layer takes the clicks). Developer tools can
  still reach the file, which is why the visible mark is drawn into it.
- **Recent pictures, an hour each.** Under the AI studio, "Your recent pictures" lists her
  previews and try-ons of this design, newest first, each with the minutes left; tapping one shows
  it large ("From your recent pictures"), so making a new picture never loses the last one. Each
  customer may see a picture for `CUSTOMER_AI_KEEP_MINUTES` (default 60) after she got it
  (`CustomerPreviewAccess`, one row per customer: a shared preview gives each customer her own
  hour; asking again renews it). `GET /v1/me/try-on/recent?designId=` lists them;
  `GET /v1/me/try-on/:id` answers 404 once her hour is over. The try-on worker sweeps every
  minute: a finished picture nobody may see any more has its files deleted (the picture, and her
  own photo for a try-on) and the row marked `purgedAt` (paths cleared; the row stays so credits
  and daily limits stay right). Previews (only the abaya, no customer photo) and "a model like me"
  try-ons (a made-up model with her height and size; marked by their first choice line) are kept
  longer and listed on the admin's Customer AI previews page: `CUSTOMER_AI_PREVIEW_KEEP_HOURS` (default 48) after they were
  made; the customer still loses access after her hour, and a new customer asking for the same
  choices meanwhile gets the kept picture. Try-ons on her own photo are always deleted after the hour
  and never shown to staff. A shared
  preview is made afresh for the next customer once it is deleted.
  **Save:** under every finished preview and try-on (and on each card in "My AI pictures") is
  "Save to My AI pictures" (`POST|DELETE /v1/me/try-on/:id/save`). A saved picture has no hour:
  her access is stored as `SAVED_UNTIL` (year 9999), so the clean-up never reaches it, and it
  stays until she removes it (`DELETE /v1/me/try-on/:id`, which for a preview only ends her
  access) or deletes her account (her try-ons are then deleted, saved ones included). Saving a
  try-on deletes her own photo at once (only the result is kept; while its check or a better
  version is still running, as soon as it is final) and lifts the 30-day clean-up. Un-saving
  gives the usual hour from then. At most `MAX_SAVED_AI_PICTURES` (50) saved per customer
  (`422 SAVED_LIMIT`). "My AI pictures" shows "Saved" (no time limit) above "Recent" (countdown).
  `User.lastActiveAt` ("last seen", written at most every 10 minutes) is recorded but not used for
  deletion.
- **No printing.** `@media print` in `app/globals.css` hides every image, video and background
  image and prints a short notice (English or Arabic) at the top; text prints normally.
- **Notices.** A line under the product gallery and under AI previews and try-ons ("For personal
  viewing only; every image carries an invisible mark"), a footer line, and the Terms of use
  "Intellectual property" section (no copying, screenshots, printing or sharing to copy, sell,
  advertise or have a design made elsewhere; the mark is used to find copies and request takedowns).

## Look and feel: editorial storefront (Phase 1 of the redesign)

**Product page (premium layout).** Gallery: framed main photo with a gold hairline, "01 / 04"
counter, hover arrows, and a vertical thumbnail rail on desktop; it stays pinned while the
options scroll. Info column: gold-rule eyebrow, large title, "From" price with "Stitched to
your measurements", named colour swatches, three promise tiles (lead time, photos at every
stage, free alteration). A description written as "Key : Value" pairs (one line or one per
line) is shown as a two-column **The details** list (`parseDescriptionSpecs()` in
`@abaya/contracts`); anything else stays a paragraph. Options are numbered steps (01 Fabric,
02 Colour…), swatches show their names, and the total sits in a deep burgundy card with the
gold "Add to bag" button.

- **Editorial hero** (`components/home/hero-showcase.tsx`): one large arch with the newest looks
  crossfading and slowly pushing in, a caption with the design and its price, a progress bar per
  look, a thumbnail rail; pauses on hover/focus/hidden tab, no motion when reduced motion is set.
- **Product cards as a magazine edit** (`components/design/design-card.tsx`): an arched photo
  that switches to the second angle on hover (`DesignCard.hoverImageUrl`); a dark green
  "New arrival" tag (`isNew`: published within `NEW_ARRIVAL_DAYS` = 30 days) and the wishlist
  heart float at the arch's open corners, outside the clipped frame; below, the collection name
  (`collectionName`, else the style) with a gold dot, the name in the display serif, the price,
  "Made to order · N days" (`leadTimeDays`) and colour dots (`colours`, up to 3 shown). With a
  mouse the card lifts onto a gold-edged champagne panel and two buttons rise over the photo:
  **Quick view** (`components/design/quick-view.tsx`, a dialog with the photos, colour dots that
  switch to that colour's photos, price, description and "Customize this abaya") and
  **Customize this abaya** (the design page). The photo and the name are both links; no
  stretched link, so the buttons stay clickable.
- **Collections as a magazine spread** (`components/home/collection-tiles.tsx`): the first
  collection is the big photograph, the rest beside it; each tile shows its newest published
  design (`CollectionDto.coverImageUrl`).
- **From sketch to you** (`components/home/journey.tsx`, `journey-art.tsx`): scroll-driven
  (Framer `useScroll` on a track of 3.5 screens, a spring, `x` on the rail; `GLIDE_SCREENS`,
  `HOLD`), each card a real design photo cropped to the detail (fabric, hem, sleeve, chest) or a
  gold line drawing for Sketch and Pattern, plus that step's craft motion (globals.css
  `.journey-art`) and when it happens (`journeyWhen`). Under the rail: the stitch with seven
  stops and the needle, then three promise chips (`journeyTrust`).
- **Photoshoot gallery** (`components/design/gallery.tsx`): the main frame shows the whole photo
  (`fit="contain"` on a soft champagne ground, never a cropped face); thumbnails carry each shot's caption,
  and a full-screen viewer (arrows, keys, click to zoom 2×) shows the embroidery up close. The
  product page lists the available colours as dots under the price.

## Rules

- Never show designs that are not `PUBLISHED`.
- Never trust client prices; the bag always shows the latest server quote.
- Image URLs come from the API (public bucket); use `next/image` with Supabase
  domain in `images.remotePatterns`.
- Every page has proper `<title>`, meta description and Open Graph image for SEO.
- Mobile-first layouts; test at 360 px width.
- Accessibility: labelled form fields, focus states, alt text from `DesignImage.alt`.

## Currency

Everything is priced, quoted, stored and charged in **INR**. The site can *display* prices in
**AED** or **SAR** (Saudi riyal): a switch in the header offers rupees and the visitor's Gulf
currency (riyals for Saudi visitors, dirhams otherwise), remembered in the browser
(`lib/currency.tsx`, `components/i18n/currency-switch.tsx`). The default follows the visitor's
country (see "Country defaults" below); without one, Arabic pages show AED and English INR. Client components
format with `useMoney()`; server components use `<Price paise />`. The rate comes from
`GET /v1/pricing/rates` (a free daily feed, cached; a configured fallback when the feed is down),
rounded to whole dirhams. The checkout total shows the rupee charge under the AED amount and the
pay button always says the rupee amount; the footer carries the reference-rate note in AED.

## Languages (English and Arabic)

- English lives at the plain addresses (`/abayas`), Arabic under `/ar` (`/ar/abayas`).
  `middleware.ts` rewrites plain addresses to `app/[lang=en]` and passes `/ar/...` through;
  `/en/...` redirects to the plain address. Both languages are pre-rendered.
- Arabic pages are right-to-left (`<html dir="rtl">`): layouts use logical classes
  (`ms-/me-/ps-/pe-/start-/end-/text-start`), arrows are mirrored (`rtl:-scale-x-100`),
  the hero carousel and gallery move the other way, the mobile menu slides in from the right.
- Fonts: Inter + Cormorant Garamond (English); IBM Plex Sans Arabic + Amiri (Arabic). Arabic
  text has no letter-spacing or italics. Numbers use Western digits in both; prices stay ₹.
- Text: `content/strings.ts` (English) and `content/strings.ar.ts` (Arabic, same keys — the
  compiler checks). Client components read it with `useStrings()`; server pages with
  `stringsFor(params)`. Links and navigation use `components/i18n/navigation` (`Link`,
  `useRouter`, `usePathname`) so visitors stay in their language.
- The **language switch** (“العربية” / “English”) is in the header and the mobile menu.

### Country defaults (geo)

- `middleware.ts` reads the visitor's country from the host's geo header (`x-vercel-ip-country`,
  or Cloudflare's `cf-ipcountry`) and keeps it in the `abaya.country` cookie (`lib/geo.ts`).
- First visit from Saudi Arabia, the UAE, Qatar, Kuwait, Bahrain or Oman to an English address:
  redirected (307) to the same page under `/ar`. India and everywhere else stay in English.
  A shared `/ar` link always opens in Arabic.
- The decision is made once (`abaya.lang-auto` cookie); after that the visitor's language switch
  always wins. Search-engine and link-preview bots are never redirected.
- Display currency default: Saudi Arabia SAR, the other five Gulf countries AED, everywhere else INR.
  The header switch overrides it.
- Testing without a geo header (local development): add `?country=SA` (or `AE`, `IN`, …) to any
  address. It acts as a first visit from that country and forgets the saved currency once.
  Login (Clerk) is shown in Arabic on Arabic pages. Sitemap and page metadata list both
  languages (hreflang).
- Product content (design names, descriptions, option names) comes from the admin panel in
  English for now. The Arabic text is a draft: have a native speaker review it before launch.

## Look and feel (Arabic-inspired)

- Arch shapes: product images and cards are arches (rounded tops), with a gold arch outline
  and a warm "lantern" glow on hover.
- Girih (eight-pointed star) lattice as a faint background in the hero, "How it works",
  collection headers, the closing banner and the footer (`components/ornament/geometric.tsx`).
- Gold (`gold-*` in Tailwind) for stars, hairlines and hovers next to the deep green.
- Motion: star dividers draw themselves in (`data-reveal="draw"`), a glowing star medallion,
  arch reveals (`data-reveal="arch"`). Everything is off with "reduce motion".

## Folder layout

```
apps/web/
├─ app/                     # routes above
├─ components/
│  ├─ design/               # DesignCard, Gallery, RedesignPanel, OptionGroup, PriceSummary
│  ├─ cart/  checkout/  orders/  account/  layout/
│  └─ ui/                   # shadcn components
├─ lib/
│  ├─ api-client.ts         # typed fetch wrapper, attaches the Clerk session token
│  └─ queries/              # TanStack Query hooks
└─ content/                # strings.ts (English), strings.ar.ts (Arabic), i18n.ts (languages)
```
