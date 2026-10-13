# Abaya AI service

Private helper for the admin panel's **AI assistant** (build plan Step 15, ADR 0005):

- **Fingerprints** for duplicate detection: a CLIP image embedding + a perceptual hash.
- **Suggestions**: tags from `vocabulary.json`, a style and alt text.

Only `apps/api` calls it, with the shared `AI_SERVICE_TOKEN`. It has no database.

## Run it (development)

From the repo root:

```bash
pnpm ai:setup   # once: Python venv + dependencies (torch, open_clip, FastAPI…)
pnpm ai:dev     # http://localhost:8000 — reads the repo-root .env
pnpm ai:test    # tests (fake model, no download)
```

The first start downloads the CLIP model (~350 MB) into `~/.cache/huggingface`;
`GET /health` shows `"loaded": true` when it is ready. Settings come from the root
`.env`: `AI_SERVICE_TOKEN` (must match the API), `SUPABASE_URL` (its host is allowed
for image downloads automatically) and optionally `AI_TAGGER`, `AI_ALLOWED_IMAGE_HOSTS`.

## Endpoints

| Method | Path | Auth | What |
| --- | --- | --- | --- |
| GET | `/health` | none | `{ status, model, tagger, loaded, vocabulary_version }` |
| POST | `/v1/analyze` | `Authorization: Bearer <AI_SERVICE_TOKEN>` | `{ image_url }` → `{ embedding[512], phash, tags[], style, alt_text, model, tagger }` |

Errors: `401` bad token · `422` the image can never work (not an image, host not
allowed, too large) · `502` download failed (the API retries with a fresh URL) ·
`503` analysis failed / model not ready.

## Editing the tag list

`vocabulary.json` is the only list the AI may suggest from. Each group is
single-choice (`colour`, `fabric`…) or multi-choice (`embellishment`, `occasion`);
`min_score` is how sure the model must be. After editing, restart the service and
(optionally) re-analyse existing images from the API:
`POST /v1/admin/ai/reanalyse` (super admin).

## Switching to Claude later

`pip install '.[claude]'`, set `AI_TAGGER=claude` and `ANTHROPIC_API_KEY` in `.env`,
restart. Fingerprints (duplicate detection) still use CLIP. Only design and
reference images are sent — never customer photos.

## Production

`Dockerfile` builds a CPU image with the model baked in (no download at start).
Give it ~2 GB RAM, keep it private (internal network), set a long random
`AI_SERVICE_TOKEN`. See `docs/deploy.md` §2b.
