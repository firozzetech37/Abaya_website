# AI service — `services/ai` (Phase 2)

Python 3.12, FastAPI, Pydantic, running jobs pulled from the API (HTTP calls
authenticated with `AI_SERVICE_TOKEN`; later a queue). GPU work on Modal or
RunPod. Results are cached by image hash.

## Jobs

| Job | Input | Output | Used by |
| --- | --- | --- | --- |
| `tag-image` | image URL | `{ style, fabricGuess, sleeve, closure, colours[], embellishments[], confidence }` | admin reference/design review (pre-fills tags) |
| `embed-image` | image URL | vector → `embedding vector(768)` column on Reference/Design (added in a Phase 2 migration: enable the `vector` extension in Supabase, Prisma type `Unsupported("vector(768)")`, queried with raw SQL) | duplicate detection, "similar designs" |
| `draft-tech-pack` | order item snapshot | tech pack JSON (fixed schema) | production manager approves |
| `render-redesign` | design image + selected options | preview image | customer "Preview my redesign" |
| `measure-from-photos` | front + side photo, height | measurement estimates | measurement form pre-fill (customer confirms) |

## Rules

- Never store body photos longer than the job needs (DPDP); delete after use
  unless the customer opted to keep them.
- Every AI output is a suggestion a human confirms: tags, tech packs and
  measurements are editable before they are saved.
- Log model name + version with every result.

## Layout

```
services/ai/
├─ app/
│  ├─ main.py            # FastAPI app, auth dependency
│  ├─ domain/            # Pydantic schemas: Tags, TechPack, Measurements
│  ├─ pipelines/         # tag, embed, tech_pack, render, measure
│  └─ adapters/          # model runners, storage, vision-language model client
├─ tests/
└─ pyproject.toml
```
