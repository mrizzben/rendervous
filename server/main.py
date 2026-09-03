"""Rendervous FastAPI app.

A1111-style Stable Diffusion WebUI clone backed by OpenRouter image models.
Async generation via a single background worker thread consuming a job queue.
"""

import base64
import io
import json
import os
import queue
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

from . import db, prompt_builder
from . import openrouter as or_

app = FastAPI(title="Rendervous")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
os.makedirs(db.IMAGES_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=db.IMAGES_DIR), name="images")

# ------------------------------------------------------------------ helpers


def _json(text: str) -> dict:
    """Parse a stored JSON blob; corrupt/empty rows fall back to {}."""
    try:
        return json.loads(text or "{}")
    except (ValueError, TypeError):
        return {}


def _image_url(path: str) -> str:
    """DB image_path -> client-visible /images/{filename} URL, or ''."""
    if not path:
        return ""
    return f"/images/{os.path.basename(path)}"


def _data_url(path: str) -> str:
    """DB image_path -> base64 data URL (what OpenRouter actually needs).

    The design reference lives on local disk; the worker sends it to
    OpenRouter as an inline data URL rather than a URL the provider could
    fetch. The browser-facing /images URL is for humans, not for the API.
    """
    full = os.path.join(db.IMAGES_DIR, os.path.basename(path))
    try:
        with open(full, "rb") as f:
            raw = f.read()
    except OSError as e:
        # Missing/corrupt reference image: fail the job with a clear message
        # instead of a raw traceback surface in the job UI.
        raise or_.OpenRouterError(f"reference image unreadable: {e}") from e
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else "png"
    mime = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
    }.get(ext, "image/png")
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def _save_bytes(data: bytes, ext: str = "png") -> str:
    """Persist raw bytes under data/images and return the relative path."""
    fname = db.new_image_path(ext)
    try:
        with open(os.path.join(db.IMAGES_DIR, fname), "wb") as f:
            f.write(data)
    except OSError as e:
        raise or_.OpenRouterError(f"could not save image: {e}") from e
    return fname


def _resize(data: bytes, width, height) -> bytes:
    """Resize+center-crop output to width x height; always emit PNG.

    Keeps the API honest about the requested size without much code. Also
    normalizes provider formats (some ignore output_format and return WEBP).
    """
    if not width and not height:
        return data
    img = Image.open(io.BytesIO(data))
    w, h = width or img.width, height or img.height
    if img.format == "PNG" and (img.width, img.height) == (w, h):
        return data
    img = img.convert("RGB")
    img = img.resize((w, h), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def client_api_key(
    header_key: str | None = None,
    body_key: str | None = None,
    query_key: str | None = None,
) -> str:
    """Per-request key, first non-empty of query/header/body, else env fallback."""
    for k in (query_key, header_key, body_key):
        if k:
            return k
    return os.environ.get("OPENROUTER_API_KEY", "")


# ------------------------------------------------------------------ models


class GenerateRequest(BaseModel):
    model: str | None = None
    prompt: str | None = None
    negative_prompt: str | None = None
    width: int | None = None
    height: int | None = None
    steps: int | None = None
    cfg: float | None = None
    denoise: float | None = None
    seed: int | None = None
    image_url: str | None = None  # data URL (img2img input)
    project_id: int | None = None
    design_id: int | None = None
    visualization_id: int | None = None
    parent_revision_id: int | None = None
    settings: dict | None = None
    api_key: str | None = None


@app.get("/api/health")
def health():
    env_key = bool(os.environ.get("OPENROUTER_API_KEY"))
    return {"ok": True, "key_configured": env_key}


@app.get("/api/models")
def get_models():
    try:
        return {"models": or_.list_models()}
    except or_.OpenRouterError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/api/generate")
def generate(req: GenerateRequest, x_openrouter_key: str | None = Header(default=None)):
    """Queue a generation job. Returns job_id (and revision_id if derived)."""
    key = client_api_key(x_openrouter_key, req.api_key)

    settings = req.settings or {}
    prompt = req.prompt
    if not prompt:
        prompt = prompt_builder.build_prompt(settings)

    # Resolve the input image: explicit image_url wins; else the design's
    # reference image (as a base64 data URL); else None (no reference).
    image_url = req.image_url
    design = None
    if not image_url and req.design_id:
        design = db.get_design(req.design_id)
        if design:
            image_url = _data_url(design["image_path"])

    params = {
        "width": req.width,
        "height": req.height,
        "steps": req.steps,
        "cfg": req.cfg,
        "denoise": req.denoise,
        "seed": req.seed if req.seed is not None else -1,
        "settings": settings,
        "image_url": image_url or None,
        "visualization_id": req.visualization_id,
        "parent_revision_id": req.parent_revision_id,
    }
    job_id = db.create_job(
        model=req.model or or_.DEFAULT_MODEL,
        prompt=prompt,
        params=json.dumps(params),
        revision_id=None,
    )
    # The user's api_key rides along in memory only (queue item), never in the
    # DB row — per-request keys are not persisted. The worker applies it to the
    # OpenRouter call and drops it afterwards.
    _worker_queue.put((job_id, key or ""))
    return {"job_id": job_id, "revision_id": None}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: int):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    params = _json(job["params"])
    return {
        "id": job["id"],
        "status": job["status"],
        "progress": None,
        "image_url": _image_url(job["image_path"]),
        "error": job["error"],
        "model": job["model"],
        "prompt": job["prompt"],
        "params": params,
        "revision_id": job["revision_id"],
        "created_at": job["created_at"],
    }


# ---------------------------------------------------------------- projects


class ProjectCreate(BaseModel):
    name: str


@app.post("/api/projects")
def create_project(req: ProjectCreate):
    pid = db.create_project(req.name.strip() or "Untitled Project")
    return {
        "id": pid,
        "name": req.name,
        "created_at": db.get_project(pid)["created_at"],
    }


@app.get("/api/projects")
def list_projects():
    rows = db.list_projects()
    return [dict(r) for r in rows]


@app.get("/api/projects/{project_id}")
def project_tree(project_id: int):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")
    designs = []
    for d in db.list_designs(project_id):
        vizes = []
        for v in db.list_visualizations(d["id"]):
            revisions = []
            for r in db.list_revisions(v["id"]):
                revisions.append(
                    {
                        "id": r["id"],
                        "parent_revision_id": r["parent_revision_id"],
                        "label": r["label"],
                        "prompt": r["prompt"],
                        "model": r["model"],
                        "params": _json(r["params"]),
                        "image_url": _image_url(r["image_path"]),
                        "created_at": r["created_at"],
                    }
                )
            vizes.append(
                {
                    "id": v["id"],
                    "name": v["name"],
                    "settings": _json(v["settings"]),
                    "current_revision_id": v["current_revision_id"],
                    "revisions": revisions,
                }
            )
        designs.append(
            {
                "id": d["id"],
                "name": d["name"],
                "image_url": _image_url(d["image_path"]),
                "created_at": d["created_at"],
                "visualizations": vizes,
            }
        )
    return {"project": dict(project), "designs": designs}


@app.post("/api/projects/{project_id}/designs")
async def upload_design(
    project_id: int,
    name: str = Form("reference"),
    file: UploadFile | None = File(default=None),
    x_openrouter_key: str | None = Header(default=None),  # unused; kept for symmetry
):
    if file is None:
        raise HTTPException(status_code=400, detail="file (multipart) required")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    ext = (file.filename or "png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg"):
        ext = "png"
    path = _save_bytes(data, ext)
    did = db.create_design(project_id, name.strip() or "Reference", path)
    return {"id": did, "name": name, "image_url": _image_url(path)}


class VizCreate(BaseModel):
    design_id: int
    name: str = "Visualization"
    settings: dict | None = None


@app.post("/api/visualizations")
def create_visualization(req: VizCreate):
    design = db.get_design(req.design_id)
    if not design:
        raise HTTPException(status_code=404, detail="design not found")
    viz_id = db.create_visualization(
        req.design_id, req.name, json.dumps(req.settings or {})
    )
    return {"id": viz_id, "name": req.name}


@app.post("/api/revisions/{revision_id}/restore")
def restore_revision(revision_id: int):
    rev = db.get_revision(revision_id)
    if not rev:
        raise HTTPException(status_code=404, detail="revision not found")
    db.set_current_revision(rev["visualization_id"], revision_id)
    return {"ok": True, "current_revision_id": revision_id}


@app.delete("/api/revisions/{revision_id}")
def delete_revision(revision_id: int):
    rev = db.delete_revision(revision_id)
    if not rev:
        raise HTTPException(status_code=404, detail="revision not found")
    Path(os.path.join(db.IMAGES_DIR, rev["image_path"])).unlink(missing_ok=True)
    return {"ok": True}


# ------------------------------------------------------------ job worker
# A single daemon thread consumes (job_id, api_key) items sequentially. The
# api_key travels in memory only — never written to the DB — and falls back to
# the env key inside or_.generate when empty.

_worker_queue: "queue.Queue[tuple[int, str]]" = queue.Queue()


def _worker():
    while True:
        job_id, api_key = _worker_queue.get()
        job = db.get_job(job_id)
        if not job:
            continue
        db.set_job_running(job_id)
        try:
            params = _json(job["params"])
            settings = params.get("settings") or {}
            image_bytes = or_.generate(
                model=job["model"],
                prompt=job["prompt"],
                image_url=params.get("image_url"),
                api_key=api_key,
                seed=params.get("seed"),
            )
            data = _resize(image_bytes, params.get("width"), params.get("height"))
            path = _save_bytes(data, "png")
            revision_id = None
            viz_id = params.get("visualization_id")
            if viz_id:
                # label v{n} where n = sibling count + 1
                n = len(db.list_revisions(viz_id)) + 1
                last = db.last_revision(viz_id)
                parent = params.get("parent_revision_id") or (
                    last["id"] if last else None
                )
                revision_id = db.create_revision(
                    visualization_id=viz_id,
                    parent_revision_id=parent,
                    label=f"v{n}",
                    prompt=job["prompt"],
                    negative_prompt=settings.get("negative_prompt", ""),
                    model=job["model"],
                    params=json.dumps(params),
                    image_path=path,
                )
                db.set_current_revision(viz_id, revision_id)
            db.set_job_done(job_id, path, revision_id)
        except Exception as e:  # noqa: BLE001 — surface any failure on the job
            db.set_job_failed(job_id, str(e))


threading.Thread(target=_worker, daemon=True, name="rendervous-worker").start()
