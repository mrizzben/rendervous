# Rendervous

An [Automatic1111 stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui)-style web UI where image generation runs on **OpenRouter image models** instead of a local GPU — with an architectural-visualization workflow on top (geometry-preserving prompts, projects/designs/visualizations/revisions, compare & branch).

## Features

- **A1111-style tabs**: `txt2img`, `img2img`, `Projects`, `History`
- **OpenRouter image models** (image-in + image-out), e.g. `google/gemini-2.5-flash-image` (recommended default), `google/gemini-3.1-flash-image`, `openai/gpt-5-image`, …
- **Bring-your-own-key**: paste your OpenRouter API key in the header (stored in this browser only, sent per-request as `X-OpenRouter-Key`; falls back to server env `OPENROUTER_API_KEY`). Never persisted server-side.
- **Price per image** shown in the model dropdown, sorted by price, with a `recommended` badge
- **img2img**: upload a reference image (jpeg/png/webp, resized client-side to ≤2048px) and generate from it
- **Rendervous mode** (PLAN.md): prompt template that treats the reference as the authoritative source of truth — preserve geometry/camera, transform materials/lighting/environment/photography
- **Architectural controls** (UI.md): fidelity slider `STRICT───●───CREATIVE`, lighting (Daylight/Overcast/Golden hour/Sunset/Night), material (Original/Concrete/Wood/Stone/Custom), environment (None/Tropical/Urban/Forest/Custom), natural-language "Custom instruction" ("Make the facade exposed concrete.")
- **Revision workflow**: every generation is a revision in a tree — branch from any revision, restore as current base, compare two side-by-side with a draggable divider, delete
- **History**: session log of every job with status, prompt, model, params

## Stack

- **Frontend**: Vite + React + TypeScript, hand-written A1111 dark theme (no UI framework)
- **Backend**: FastAPI (Python), SQLite (stdlib `sqlite3`), Pillow, `requests` — a background worker thread consumes a job queue and calls OpenRouter

> PostgreSQL / object storage / job system per PLAN.md §24 are deliberately not MVP; SQLite + local disk + an in-process worker are simpler and sufficient.

## Run

```bash
# 1. Backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server.main:app --port 8000

# 2. Frontend (new terminal)
npm install
npm run dev        # http://localhost:5173
```

Then paste your OpenRouter API key into the header bar (or set `OPENROUTER_API_KEY` on the server — `curl localhost:8000/api/health` shows `key_configured`).

## Run with Docker

```bash
docker compose up --build
# backend  → http://localhost:8000
# frontend → http://localhost:8080
```

- Brings its own key: paste it in the header bar; the optional `OPENROUTER_API_KEY` env var is only a fallback.
- `./data` is bind-mounted into the backend container, so projects/revisions/images survive restarts.
- Ports overridable via `BACKEND_PORT` / `FRONTEND_PORT` env vars (e.g. `FRONTEND_PORT=9000 docker compose up`).
- The frontend container is nginx serving the built assets and reverse-proxying `/api` + `/images` to the backend; the backend starts first (healthcheck-gated).

## API (summary)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | `{ok, key_configured}` |
| `GET /api/models` | image-capable OpenRouter models w/ prices (cached 1h, `?refresh=1` to bypass) |
| `POST /api/generate` | start a job; accepts raw `prompt`/`negative_prompt`/`width`/`height`/`steps`/`cfg`/`denoise`/`seed`/`image_url`, or `settings` (auto-builds the architectural prompt) + `visualization_id`/`parent_revision_id` for revision chaining |
| `GET /api/jobs/{id}` | job status (queued/running/done/failed), `image_url`, error |
| `POST /api/projects`, `GET /api/projects`, `GET /api/projects/{id}` | project CRUD + full tree (designs → visualizations → revisions) |
| `POST /api/projects/{id}/designs` | multipart upload of a reference image |
| `POST /api/visualizations` | create a viz with settings |
| `POST /api/revisions/{id}/restore` · `DELETE /api/revisions/{id}` | revision management |

Auth: pass `api_key` in the body, `?api_key=` query param, or `X-OpenRouter-Key` header; falls back to `OPENROUTER_API_KEY` env.

## Data model

```text
Project → Designs → Visualizations → Revisions (parent_revision_id = branch)
                                  └── Jobs (queued/running/done/failed)
```

Files on disk under `data/images/`, SQLite under `data/rendervous.db`, prompt template in `server/prompts.json` (configurable, not hardcoded — PLAN.md §9).
