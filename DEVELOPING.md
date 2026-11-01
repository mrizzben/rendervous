# Developing Rendervous

The [README](README.md) is the app overview and end-user setup guide. This file
covers local development, deployment, API endpoints, and desktop packaging.

## Stack

- Frontend: Vite, React, and TypeScript; custom dark studio UI.
- Backend: FastAPI, SQLite, Pillow, and requests. A background worker calls
  OpenRouter for image generation.

## Run locally

```bash
# Backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server.main:app --port 8000

# Frontend, in another terminal
npm install
npm run dev  # http://localhost:5173
```

Enter an OpenRouter API key in the UI, or configure `OPENROUTER_API_KEY` on the
backend as a fallback.

## Run with Docker

```bash
FRONTEND_PORT=8080 docker compose up --build
```

The frontend container serves the built app and proxies `/api` and `/images` to
the backend. The `./data` directory is mounted into the backend container so
projects and images persist across restarts.

## Desktop packaging and releases

`desktop.py` runs FastAPI and serves the built SPA in a native window. Build on
the target OS; PyInstaller does not cross-compile these bundles.

### Build locally

Build the frontend first, then install desktop dependencies and package on the
OS you are targeting.

```bash
npm ci && npm run build
python3 -m venv .venv-desktop
.venv-desktop/bin/pip install -r requirements-desktop.txt
.venv-desktop/bin/pyinstaller packaging/rendervous.spec --noconfirm \
  --distpath build/app --workpath build/pyinstaller
```

On Windows, use `.venv-desktop\Scripts\pip.exe` and
`.venv-desktop\Scripts\pyinstaller.exe` instead. Building the Windows installer
locally also requires Inno Setup 6 and `packaging/windows/Rendervous.iss`.

Desktop data is stored under `%LOCALAPPDATA%\Rendervous` on Windows and
`~/Library/Application Support/Rendervous` on macOS. Set `RENDERVOUS_DATA` to
override the location. Source and Docker runs continue to use `./data`.

### GitHub Actions

Manual **Build desktop apps** runs upload unsigned QA artifacts. Push a numeric
version tag such as `v0.1.5` to build and publish the Windows installer and
macOS DMGs on the repository's Releases page:

```bash
git tag v0.1.5
git push origin v0.1.5
```

All current releases are unsigned; no signing secrets are required. macOS may
require Control-click → **Open**, and Windows may show a SmartScreen warning.

## API summary

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health and key configuration status |
| `GET /api/models` | Image-capable OpenRouter models and prices |
| `POST /api/generate` | Start a render job |
| `GET /api/jobs/{id}` | Read job status, output image, or error |
| `GET /api/projects` | List projects |
| `POST /api/projects` | Create a project |
| `GET /api/projects/{id}` | Read the project's designs and revisions |
| `PATCH /api/projects/{id}` | Rename a project |
| `POST /api/projects/{id}/archive` · `DELETE /api/projects/{id}` | Archive or delete a project |
| `POST /api/projects/{id}/designs` | Upload a design reference image |
| `POST /api/visualizations` | Create a visualization |
| `POST /api/designs/{id}/archive` · `DELETE /api/designs/{id}` | Archive or delete a design |
| `POST /api/revisions/{id}/restore` · `DELETE /api/revisions/{id}` | Restore or delete a revision |

Authentication accepts `api_key` in the request body or `X-OpenRouter-Key` in
the request header; the server environment variable is a fallback.

## Data model

```text
Project → Designs (views/camera angles) → Visualizations → Revisions
                                                          └── Jobs
```

SQLite is stored in `data/rendervous.db` for source/Docker runs; images are in
`data/images/`. The prompt template is in `server/prompts.json`.
