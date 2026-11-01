# Rendervous

<p align="center">
  <img src="assets/rendervous_logo_dark.png#gh-light-mode-only" alt="Rendervous" width="480" />
  <img src="assets/rendervous_logo.png#gh-dark-mode-only" alt="Rendervous" width="480" />
</p>

An architectural visualization studio that turns a design reference into a
photorealistic render — **without redesigning it**.

> Your design, photorealistically visualized — not redesigned.

The reference design is the source of truth: preserve its geometry and camera,
while exploring materials, lighting, and atmosphere.

## What you can do

- Import a SketchUp viewport, clay render, or exported design view.
- Render without changing the design's geometry or camera.
- Tune architectural style, lighting, materials, environment, and geometry fidelity.
- Review, compare, branch, and restore render revisions.
- Make local image adjustments or request an AI edit to a selected region.
- Choose an image model and see its price before rendering.

## Set up the app

1. Download the latest [Rendervous release](https://github.com/mrizzben/rendervous/releases/latest).
2. Install it for your computer:
   - **Windows:** run `Rendervous-Windows-Setup-<version>.exe` and follow the installer.
   - **Apple silicon Mac:** download the `macos-arm64` DMG. For Intel Mac, use
     `macos-x64`. Open the DMG and drag Rendervous to Applications.
3. Create an OpenRouter account and API key, then launch Rendervous. Paste the
   key into the **Key** field, upload a design view, choose your render settings,
   and select **Render**.

The current installers are unsigned. Windows may show a SmartScreen warning;
choose **More info → Run anyway** only if you downloaded it from the official
Releases page. On macOS, Control-click Rendervous in Applications and choose
**Open** on first launch.

If macOS still refuses to open it (nothing appears, or “the application can’t
be opened”), clear the download quarantine on the installed app, then launch:

```bash
xattr -dr com.apple.quarantine /Applications/Rendervous.app
open -a /Applications/Rendervous.app
```

This only removes the Gatekeeper flag for this app; it does not change any
other security setting. Signed and notarized builds would not need it, and
require a paid Apple Developer account.

## Data and rendering

Desktop projects, revisions, and images are stored on your computer. Rendering
sends the selected reference image and settings to OpenRouter using your key.
Your key stays in the local app profile and is not saved by the app server.

## Developer

### Stack

- Frontend: Vite, React, TypeScript, and a custom dark studio UI.
- Backend: FastAPI, SQLite, Pillow, and requests. A background worker calls
  OpenRouter for image generation.

The backend refreshes model names and prices from OpenRouter at startup and
about once a day. It keeps the last good catalog in writable app data and uses
the bundled catalog if OpenRouter is unavailable. The UI reloads the list at
startup and daily while open. Run `python3 scripts/refresh_models.py` to update
the bundled fallback for a new release.

### Run locally

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
backend as a fallback. On Windows, use `.venv\Scripts\pip.exe` and
`.venv\Scripts\uvicorn.exe`.

### Run with Docker

```bash
FRONTEND_PORT=8080 docker compose up --build
```

The frontend container serves the built app and proxies `/api` and `/images` to
the backend. The `./data` directory is mounted into the backend container so
projects and images persist across restarts.

### Desktop packaging and releases

`desktop.py` runs FastAPI and serves the built SPA in a native window. Build on
the target OS; PyInstaller does not cross-compile these bundles.

Manual **Build desktop apps** workflow runs upload unsigned QA artifacts. Push a
numeric version tag such as `v0.1.5` to publish the Windows installer and macOS
DMGs on the repository's Releases page:

```bash
git tag v0.1.5
git push origin v0.1.5
```

All current releases are unsigned; no signing secrets are required. macOS may
require Control-click → **Open**, and Windows may show a SmartScreen warning.

Build locally after building the frontend with `npm ci && npm run build`:

```bash
python3 -m venv .venv-desktop
.venv-desktop/bin/pip install -r requirements-desktop.txt
.venv-desktop/bin/pyinstaller packaging/rendervous.spec --noconfirm \
  --distpath build/app --workpath build/pyinstaller
```

On Windows, use `.venv-desktop\Scripts\pip.exe` and
`.venv-desktop\Scripts\pyinstaller.exe`. Building the Windows installer
locally also requires Inno Setup 6 and `packaging/windows/Rendervous.iss`.

Desktop data is stored under `%LOCALAPPDATA%\Rendervous` on Windows and
`~/Library/Application Support/Rendervous` on macOS. Set `RENDERVOUS_DATA` to
override the location; source and Docker runs use `./data`.

### API summary

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
the request header; the backend environment variable is a fallback.

### Data model

```text
Project → Designs (views/camera angles) → Visualizations → Revisions
                                                          └── Jobs
```

SQLite is stored in `data/rendervous.db` for source/Docker runs; images are in
`data/images/`. The prompt template is in `server/prompts.json`.
