# ADR 0005 — AI assistant: CLIP service, in-memory similarity, suggestions only

- Status: accepted
- Date: 2026-09-28
- Build plan: Step 15

## Context
Designers upload images and catalog managers review every design. Two jobs are
slow and error-prone by hand: tagging (colour, fabric look, embellishments…) and
spotting that a submitted design is a copy of another design or of a reference
image (references must never become products). The build plan suggested pgvector
and BullMQ for this.

## Decision
- **`services/ai`**: a small private FastAPI service. `POST /v1/analyze` takes a
  short-lived image URL and returns a CLIP image embedding (OpenCLIP ViT-B/32,
  512 numbers, runs on CPU), a 64-bit perceptual hash, tag suggestions, a style
  guess and alt text. It has no database. Bearer-token auth; downloads only over
  https from allowed hosts (the Supabase project host, `i.pinimg.com`, extras from
  `AI_ALLOWED_IMAGE_HOSTS`).
- **Tagging engine is swappable** (`AI_TAGGER`): `clip` (default, free, zero-shot
  against `services/ai/vocabulary.json`) or `claude` (Claude vision filling a form
  restricted to the same vocabulary; needs `ANTHROPIC_API_KEY`). Both return only
  vocabulary tags. Only design and reference images are ever sent — never customer
  measurement photos, QC photos or personal data.
- **Suggestions only.** The AI never edits a design. Designers/managers accept or
  dismiss tags, style and alt text; accepting goes through the normal update path
  (audited).
- **API `ai` module** owns one table, `AiImage` (job state + embedding as `REAL[]`
  + hash + suggestions). It knows images only by id; the `catalog` module tells it
  when images are added/removed and asks for insights. A startup sync queues images
  that predate the AI and drops rows for deleted images.
- **Queue = Postgres**, same pattern as the notification outbox: rows leased with
  `FOR UPDATE SKIP LOCKED`, retries with backoff (30 s … 6 h, then `FAILED`). When
  the AI service is unreachable, jobs are released without using up attempts. No
  Redis/BullMQ.
- **Similarity in memory, not pgvector.** Each API instance keeps every embedding
  in memory and refreshes incrementally from a cheap `count + max(updatedAt)`
  marker. A full scan is milliseconds at catalogue scale (tens of thousands of
  images). No database extension is needed anywhere (local Postgres, CI, Supabase).
- **Match levels** (cosine of unit vectors): `≥ AI_DUPLICATE_THRESHOLD` (0.96) is a
  likely duplicate; `≥ AI_SIMILAR_THRESHOLD` (0.93) is similar; a near-identical
  perceptual hash (≤ 4 bits) upgrades a similar match to duplicate. Calibrated on
  the seed images and real photos: two photos of the same design 0.94–0.997,
  recompressed/cropped/mirrored copies 0.957–0.997, different real abayas 0.62–0.77.
- **Review gate.** Approving a design (`IN_REVIEW → PRICED`) that has a likely
  duplicate needs `duplicatesChecked: true`; the matches are stored in the
  `design.status_changed` audit entry. Designers see that a match exists but not
  other designers' designs or unassigned references.

## Consequences
- The Python service needs ~1.5–2 GB RAM (CLIP on CPU) and a first-run model
  download (~350 MB; baked into the Docker image).
- CLIP tagging is good for colour and clear details, weaker for fabric and fine
  embellishment; thresholds in `vocabulary.json` keep it conservative. Switching to
  `AI_TAGGER=claude` later needs no API or UI change.
- If the catalogue grows past ~50k images or several API instances make memory a
  concern, move embeddings to pgvector (Supabase supports it) behind the same
  `SimilarityIndex` interface.
- Changing the model or vocabulary: `POST /v1/admin/ai/reanalyse` (SUPER_ADMIN)
  re-queues every image; old fingerprints stay in use until replaced.
