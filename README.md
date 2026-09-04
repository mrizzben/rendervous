# Rendervous

An architectural visualization studio: architects upload their 3D design (SketchUp viewport, clay render, or any exported view) and Rendervous turns it into a photorealistic visualization — **without redesigning it**.

> Your design, photorealistically visualized — not redesigned.

The design is the source of truth. Geometry is preserved; materials, lighting, environment and atmosphere are rendered. **No prompts, no text-to-image** — this is not a Stable Diffusion WebUI clone, it is a render tool.

## Features

- **Import → Render → Revise → Compare** workflow, modeled after archviz tools (V-Ray / Enscape inspired, not copied)
- **Canvas-first studio**: left rail holds projects & views (designs), the center canvas shows the design vs. the latest render with a drag-to-compare divider, the right panel holds Visualize controls, and the bottom filmstrip holds revisions
- **Architectural controls only**: Style (Photoreal / Editorial / Minimal / Atmospheric), Lighting (Daylight / Overcast / Golden hour / Sunset / Night), Materials (As designed / Concrete / Wood / Stone / Custom), Environment (None / Tropical / Urban / Forest / Custom), Geometry fidelity slider (STRICT ↔ CREATIVE), plus an optional "what should change" natural-language note
- **Advanced lighting & camera configs**: sun direction (azimuth) and sun elevation (overrides the preset), focal length and aperture (F-stop) — tuned to feel like a real shoot, not a prompt
- **Geometry-preserving prompt template** (`server/prompts.json`): the reference is authoritative — geometry and camera are immutable, only appearance changes
- **Revision workflow**: every render is a revision of the imported design — click to make current, branch from any revision, select two to compare side-by-side, delete
- **Bring-your-own-key**: paste your OpenRouter API key in the header (stored in this browser only, sent per-request as `X-OpenRouter-Key`; falls back to server env `OPENROUTER_API_KEY`). Never persisted server-side.
- **Render engine selection**: pick any OpenRouter image model (e.g. `google/gemini-2.5-flash-image` recommended) with per-image price shown

## Stack

- **Frontend**: Vite + React + TypeScript, hand-written dark studio theme (no UI framework)
- **Backend**: FastAPI (Python), SQLite (stdlib `sqlite3`), Pillow, `requests` — a background worker thread consumes a job queue and calls OpenRouter

> Deliberately not MVP: no PostgreSQL, no object storage, no external job system — SQLite + local disk + an in-process worker thread are simpler and sufficient for a single instance.

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
# frontend only — the backend has no host port, it's reachable
# on the compose network via the nginx proxy
FRONTEND_PORT=8080 docker compose up --build
```

- Brings its own key: paste it in the header bar; the optional `OPENROUTER_API_KEY` env var is only a fallback.
- `./data` is bind-mounted into the backend container, so projects/views/revisions/images survive restarts.
- Only the frontend is host-exposed (`FRONTEND_PORT`, default `8080`); the backend is reachable only on the compose network.
- The frontend container is nginx serving the built assets and reverse-proxying `/api` + `/images` to the backend; the backend starts first (healthcheck-gated).

## API (summary)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | `{ok, key_configured}` |
| `GET /api/models` | image-capable OpenRouter models, price included, from the bundled static catalog (`server/models_catalog.json`, refreshed off-band by `scripts/refresh_models.py`) |
| `POST /api/generate` | start a render job; `settings` auto-builds the architectural prompt; `design_id` picks the reference image, `visualization_id`/`parent_revision_id` chain revisions |
| `GET /api/jobs/{id}` | job status (queued/running/done/failed), `image_url`, error |
| `GET /api/projects` | list projects |
| `POST /api/projects` | create a project |
| `GET /api/projects/{id}` | full tree: designs → visualizations → revisions |
| `PATCH /api/projects/{id}` | rename a project |
| `POST /api/projects/{id}/archive` · `DELETE /api/projects/{id}` | archive / delete a project |
| `POST /api/projects/{id}/designs` | multipart upload of a design reference image |
| `POST /api/visualizations` | create a visualization with settings |
| `POST /api/designs/{id}/archive` · `DELETE /api/designs/{id}` | archive / delete a design |
| `POST /api/revisions/{id}/restore` · `DELETE /api/revisions/{id}` | revision management |

Auth: pass `api_key` in the body or `X-OpenRouter-Key` header; falls back to `OPENROUTER_API_KEY` env.

## Data model

```text
Project → Designs (views/camera angles) → Visualizations → Revisions (parent_revision_id = branch)
                                                        └── Jobs (queued/running/done/failed)
```

Files on disk under `data/images/`, SQLite under `data/rendervous.db`, prompt template in `server/prompts.json` (configurable, not hardcoded).
