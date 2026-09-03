# Rendervous

An architectural visualization studio: architects upload their 3D design (SketchUp viewport, clay render, or any exported view) and Rendervous turns it into a photorealistic visualization — **without redesigning it**.

> Your design, photorealistically visualized — not redesigned.

The design is the source of truth. Geometry is preserved; materials, lighting, environment and atmosphere are rendered. **No prompts, no text-to-image** — this is not a Stable Diffusion WebUI clone, it is a render tool.

## Features

- **Import → Render → Revise → Compare** workflow, modeled after archviz tools (V-Ray / Enscape inspired, not copied)
- **Canvas-first studio**: left rail holds projects & views (designs), the center canvas shows the design vs. the latest render with a drag-to-compare divider, the right panel holds Visualize controls, and the bottom filmstrip holds revisions
- **Architectural controls only** (PLAN.md §10 / UI.md): Style (Photoreal / Editorial / Minimal / Atmospheric), Lighting (Daylight / Overcast / Golden hour / Sunset / Night), Materials (As designed / Concrete / Wood / Stone / Custom), Environment (None / Tropical / Urban / Forest / Custom), Geometry fidelity slider (STRICT ↔ CREATIVE), plus an optional "what should change" natural-language note
- **Geometry-preserving prompt template** (`server/prompts.json`): the reference is authoritative — geometry and camera are immutable, only appearance changes
- **Revision workflow**: every render is a revision of the imported design — click to make current, branch from any revision, select two to compare side-by-side, delete
- **Bring-your-own-key**: paste your OpenRouter API key in the header (stored in this browser only, sent per-request as `X-OpenRouter-Key`; falls back to server env `OPENROUTER_API_KEY`). Never persisted server-side.
- **Render engine selection**: pick any OpenRouter image model (e.g. `google/gemini-2.5-flash-image` recommended) with per-image price shown

## Stack

- **Frontend**: Vite + React + TypeScript, hand-written dark studio theme (no UI framework)
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
- `./data` is bind-mounted into the backend container, so projects/views/revisions/images survive restarts.
- Ports overridable via `BACKEND_PORT` / `FRONTEND_PORT` env vars (e.g. `FRONTEND_PORT=9000 docker compose up`).
- The frontend container is nginx serving the built assets and reverse-proxying `/api` + `/images` to the backend; the backend starts first (healthcheck-gated).

## API (summary)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | `{ok, key_configured}` |
| `GET /api/models` | image-capable OpenRouter models (cached 1h, `?refresh=1` to bypass) |
| `POST /api/generate` | start a render job; `settings` auto-builds the architectural prompt; `design_id` picks the reference image, `visualization_id`/`parent_revision_id` chain revisions |
| `GET /api/jobs/{id}` | job status (queued/running/done/failed), `image_url`, error |
| `POST /api/projects`, `GET /api/projects`, `GET /api/projects/{id}` | project CRUD + full tree (designs → visualizations → revisions) |
| `POST /api/projects/{id}/designs` | multipart upload of a design reference image |
| `POST /api/visualizations` | create a viz with settings |
| `POST /api/revisions/{id}/restore` · `DELETE /api/revisions/{id}` | revision management |

Auth: pass `api_key` in the body, `?api_key=` query param, or `X-OpenRouter-Key` header; falls back to `OPENROUTER_API_KEY` env.

## Data model

```text
Project → Designs (views/camera angles) → Visualizations → Revisions (parent_revision_id = branch)
                                                        └── Jobs (queued/running/done/failed)
```

Files on disk under `data/images/`, SQLite under `data/rendervous.db`, prompt template in `server/prompts.json` (configurable, not hardcoded — PLAN.md §9).
