# REVIEW.md — Codebase review (evidence only, no fixes applied)

Scope: `server/` (main.py, db.py, geometry.py, prompt_builder.py, openrouter.py), `src/` (React frontend), configs (nginx.conf, Dockerfiles, docker-compose.yml), and the working-tree diff (uncommitted geometry-lock change).

Checks run during this review:

| Check | Result |
| --- | --- |
| `npm run build` | PASS (39 modules, built in 1.01s) |
| `.venv/bin/python -m server.test_geometry` | PASS |
| `.venv/bin/python -m server.test_aspect` | PASS |
| `.venv/bin/python -m server.test_projects` | PASS |
| `.venv/bin/python -m server.test_prompt_builder` | **FAIL** — `ModuleNotFoundError: No module named 'prompt_builder'` (finding B5) |
| Import sanity of `server.main` / all modules | PASS |

Working-tree diff (uncommitted) is itself fine: the `Dockerfile.frontend` trailing-newline fix and the `_geometry_lock` integration in `server/main.py` both look correct in isolation (see B6 for the worker-context caveat). Observations F-series are lower-priority improvements.

Legend: **B** = bug, **I** = improvement/optimization. Each entry: evidence → where to fix → how.

---

## B1. Project deletion leaks every revision image file on disk

**Evidence.** `DELETE /api/projects/{id}` (`server/main.py:273-283`) collects paths only from `db.delete_project(project_id)`, which returns "SELECT image_path FROM designs WHERE project_id=?" rows — i.e. only the design *reference* images (`server/db.py:170-185`). Revision renders (the most numerous files) are never unlinked. Compare with `delete_design` (`server/main.py:316-330`), which correctly walks visualizations → revisions before deleting. Every project deletion therefore orphans dozens of PNGs in `data/images/` forever (compose bind-mounts `./data`, so they persist everywhere).

**Where.** `server/main.py` `delete_project`, or better: inside `server/db.py::delete_project`.

**How.** Mirror `delete_design`: before the cascade `DELETE FROM projects`, collect `SELECT r.image_path FROM revisions r JOIN visualizations v ON v.id=r.visualization_id JOIN designs d ON d.id=v.design_id WHERE d.project_id=?` in addition to the design paths. Doing it in `db.py` makes the delete atomic with the commit, which is also slightly safer than the current main.py unlink-after pattern.

```python
# server/db.py, delete_project — before DELETE
rows = conn().execute(
    "SELECT image_path FROM designs WHERE project_id=? UNION "
    "SELECT r.image_path FROM revisions r "
    "JOIN visualizations v ON v.id=r.visualization_id "
    "JOIN designs d ON d.id=v.design_id WHERE d.project_id=?",
    (project_id, project_id),
).fetchall()
```

**Check.** One test in `server/test_projects.py` style: create project → design → render → delete project → assert all referenced image files are gone from `data/images`.

---

## B2. Deleting the current revision leaves a dangling `current_revision_id`

**Evidence.** `DELETE /api/revisions/{id}` (`server/main.py:400-405`) deletes the row and unlinks its file but never corrects `visualizations.current_revision_id` (`server/db.py` only writes it in `set_current_revision:294-304`). After deleting the current revision: the canvas shows nothing (`App.tsx` `currentRev` = `revisions.find(r => r.id === currentId)` → undefined, `CanvasStage renderUrl` = null), the filmstrip loses its "current" marker, and the next render is queued with `parent_revision_id` pointing at a deleted revision (`App.tsx:193-199` passes `currentId ?? undefined`). The branch history then chains through a ghost.

**Where.** `server/main.py::delete_revision` (single caller site) — new guard after `db.delete_revision`.

**How.** If the deleted revision was the viz's current one, point `current_revision_id` at the latest remaining revision (or NULL if none). Small, root-cause fix in one place — no frontend changes needed:

```python
viz = db.get_visualization(rev["visualization_id"])
if viz and viz["current_revision_id"] == revision_id:
    last = db.last_revision(viz["id"])          # already exists, db.py:327-339
    db.set_current_revision(viz["id"], last["id"] if last else None)
```

**Check.** Extend `test_projects.py`-style check: create viz with 2 revisions, delete the current one, assert `current_revision_id` == remaining id, and assert `passing a stale parent id` is impossible.

---

## B3. Worker thread can die permanently and silently wedge the queue

**Evidence.** In `server/main.py::-_worker` (lines 443-510), only the generation body is inside `try:`. `job = db.get_job(job_id)` (line 445), `db.set_job_running(job_id)` (line 448) run *outside* any try. A transient sqlite error there (disk-full, locked timeout) propagates out of the `while True` and kills the single daemon thread. There is no watchdog. Result: every future job stays `queued` forever; the UI spinner (`App.tsx pollUntil`) spins indefinitely while the API still answers health checks. Also: rows left in `status='running'` after a process crash are never re-queued or marked failed on startup.

**Where.** `server/main.py::_worker` (loop structure) and app startup (before `threading.Thread(...).start()` at the file end).

**How.**

1. Wrap the whole loop body in try/except and `continue` — a dead worker must never be possible from a request-path error:

```python
def _worker():
    while True:
        job_id, api_key = _worker_queue.get()
        try:
            ... existing body ...
        except Exception as e:
            try:
                db.set_job_failed(job_id, str(e))
            except Exception:
                pass  # ponytail: last-resort; db down means nothing else works
```

2. Startup recovery, one statement in `main` scope: `db.recover_stale_jobs()` — a 5-line helper in `db.py` that runs `UPDATE jobs SET status='failed', error='server restarted mid-job' WHERE status IN ('queued','running')` (or re-enqueue the queued ones via `_worker_queue`). Failing loud beats zombie rows.

**Check.** `-m server.test_worker`-style script: raise inside `db.get_job` once via monkeypatch, assert the thread picks up the next queued job.

---

## B4. `_resize` distorts aspect ratio (comment says center-crop, code does plain stretch)

**Evidence.** `server/main.py:99-113`: docstring says "Resize+center-crop output to width x height" but the code is `img = img.resize((w, h), Image.Resampling.LANCZOS)` with no crop. If a provider returns an image whose aspect differs from the requested `width x height` (models ignore `output_format`/ratios routinely — that's why the ratio-snap retry in `openrouter.py:183` exists), the saved revision is visibly stretched. Latent today only because the UI doesn't send width/height (only `aspect_ratio`), but the API accepts both and the bug fires the moment it does.

**Where.** `server/main.py::_resize`.

**How.** One line — use `PIL.ImageOps.fit`, which does exactly "resize + center-crop to box":

```python
from PIL import ImageOps
...
img = ImageOps.fit(img.convert("RGB"), (w, h), Image.Resampling.LANCZOS)
```

Delete the manual `img.convert("RGB")` + `img.resize` pair; `fit` handles both.

---

## B5. `test_prompt_builder.py` is broken and pytest is not even installed

**Evidence.** `server/test_prompt_builder.py:3` does `from prompt_builder import _SKY_SENTENCES, build_prompt`. `server/` has `__init__.py`, so under pytest the tests import as `server.test_prompt_builder` with the *repo root* on `sys.path` — the bare `prompt_builder` import resolves to nothing (verified: running the file errors immediately; there is no `conftest.py`, `pytest.ini`, or `pyproject.toml` anywhere). And `pytest` is not in `requirements.txt` nor in `.venv` (`No module named pytest`). So the 12 lamp-temp/sky/fidelity assertions have likely never run in this environment. The sibling tests (`test_geometry`, `test_aspect`, `test_projects`) avoid this by importing via the `server.` package and running as `python -m server.test_...` — the法制不一致 itself is a trap.

**Where.** `server/test_prompt_builder.py:3`, plus a Decide: pytest vs `-m` convention.

**How.** Cheapest consistent fix (matches siblings, no new dependency): change line 3 to `from server.prompt_builder import _SKY_SENTENCES, build_prompt`, convert `def test_*()` functions that use bare `ppp` asserts into a runnable main (they already assert — add at file bottom):

```python
if __name__ == "__main__":
    test_lamp_temp_ignored_outside_night_sunset()
    ...  # or iterate module members
    print("prompt_builder ok")
```

…then run `.venv/bin/python -m server.test_prompt_builder`. If the team prefers pytest instead, add `pytest` to a `requirements-dev.txt` and add a `[tool.pytest.ini_options]`… but one convention, not two.

---

## B6. Frontend `pollUntil` can spin forever; stuck jobs have no terminal state

**Evidence.** `src/api.ts:392-400`: `while (true) { ... await wait(intervalMs); }` — no attempt cap, no timeout. `App.tsx:193` polls `getJob(job_id)` every 2s while `busy` blocks the whole Render button. If the backend restarts mid-poll (job row `running` → orphaned, B3) or the worker thread dies, the UI is stuck "Rendering … NNs" indefinitely with no recoverable exit except reload.

**Where.** `src/api.ts::pollUntil` (add optional deadline) and `App.tsx::runRender` (pass it).

**How.** Keep the exact signature backward-compatible; add `timeoutMs = 15 * 60_000` (OpenRouter call itself is capped at `timeout=300` seconds in `openrouter.py:277`, so 15min covers queue-ahead generously):

```ts
export async function pollUntil<T>(fn, isDone, intervalMs = 2000, timeoutMs = 900_000): Promise<T> {
  const t0 = Date.now();
  while (true) {
    const v = await wait(0).then(fn);
    if (isDone(v)) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error("Render timed out — the job may still finish; check the filmstrip later.");
    await wait(intervalMs);
  }
}
```

`runRender`'s existing `catch (e) fail(e)` then surfaces it in the banner.

---

## B7. Uploads are unvalidated server-side: no size cap, no content-type check, no image verify

**Evidence.** `server/main.py:332-356` (`upload_design`): `data = await file.read()` is unbounded (10MB cap lives only in nginx `client_max_body_size 10m` — running plain `uvicorn` locally per README §"Run" has no cap at all), and raw bytes are written to disk with only filename-extension sniffing (`ext not in (...) → "png"`). A 2GB upload exhausts memory; a corrupt/renamed file (e.g. `photo.exe`→ saved `photo.png`) later served back via `/images/` StaticFiles. The frontend (`src/components/LeftRail.tsx:51-61`, `MAX_UPLOAD_MB = 10` in `src/api.ts:425`) does validate — but "client-only validation at a trust boundary" is the classic gap; this endpoint is publicly reachable inside the compose network and on dev.

**Where.** `server/main.py::upload_design` (one guard at the top; optionally a tiny `_verify_image` helper next to `_save_bytes`).

**How.**

1. Size cap (read in chunks instead of slurping):

```python
MAX_UPLOAD = 10 * 1024 * 1024
data = b""
chunk = b"8k placeholder"
data = bytearray()
while chunk := await file.read(1 << 20):
    data += chunk
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Image is too large — the max file size is 10 MB.")
data = bytes(data)
```

2. Trust-bytes-not-names verify + re-encode (also normalizes WEBP misextension — currently a `.webp` upload falls through the ext filter to `png` while storing WEBP bytes):

```python
from PIL import Image, UnidentifiedImageError
try:
    img = Image.open(io.BytesIO(data)); img.verify()
except (UnidentifiedImageError, OSError):
    raise HTTPException(status_code=400, detail="Unsupported or corrupt image") from None
```

(Optionally re-save through Pillow before `_save_bytes` to strip payloads; for BYOK-user-only MVP the verify without re-encode is the 80%.)

**Check.** `-m server.test_upload`-style: oversize body → 413, Renamed.EXE → 400, real jpg accepted; assert ext in path == actual format.

---

## I1. Full base64 reference image is persisted into every revision row and re-sent on every poll

**Evidence.** In `_worker` (`server/main.py:498`), `create_revision(..., params=json.dumps(params))` serializes `params` **including `params["image_url"]`**, the complete multi-MB base64 data URL of the design reference (a 10MB upload → ~13.7MB base64 → into HEAD of *every* revision of that design — SQLite rows in `data/rendervous.db`). Worse, that same JSON then flows back to the client:
- `GET /api/jobs/{id}` (`server/main.py:220`) returns `"params": params` — every browser poll (2s interval, `App.tsx:193`) re-downloads the full base64 reference.
- `GET /api/projects/{id}` (`server/main.py:312` via `_json(r["params"])`) sends it again for *each revision* in the project tree.

Performance + payload bloat, worst on the hot polling path.

**Where.** `server/main.py::_worker` (stop persisting it), `get_job` + `project_tree` (defensive strip) — one place is enough: strip at serialization points.

**How.** Root cause: the reference is already derivable — the row knows `design_id` usage; the frontend doesn't need the data URL back (it renders the reference from the design's `image_url` `/images/...` URL). Minimal diff: before `json.dumps(params)` in the worker, `params.pop("image_url", None)` (keep it in the *local* variable used for `or_.generate`). Belt-and-braces: in `get_job`/`project_tree`, `_json(...)` then `out.pop("image_url", None)`. If future flows need the reference from a revision, store the design_id or the relative path instead of bytes.

**Check.** After fix: `GET /api/jobs/1` body no longer contains `data:` anywhere; test asserts `"data:" not in json.dumps(get_job(...))`.

---

## I2. Job polling loop in the panel blocks navigation-less work; consider an in-flight retry cap only (smallest viable)

**Evidence.** `App.tsx:186-199` `runRender` awaits `pollUntil` inline; nothing else needed — the filmstrip and settings remain interactive by design, and B6 covers the runaway case. Noting it only so the B6 fix doesn't tempt a bigger refactor (BackgroundRunner, AbortController etc.) — unnecessary for this code size.

**How.** No action beyond B6. ponytail: don't add state machines for a one-thing-at-a-time studio UI.

---

## I3. `project_tree` issues N+1 queries per design/visualization/revision

**Evidence.** `server/main.py:289-321` loops `db.list_designs` → for each `db.list_visualizations` → for each `db.list_revisions`. With D designs × V vizes × R revisions that's 1 + D(1+V) queries on the most-open screen (`App::loadProject`, `App::reload` after every mutation). SQLite-local, so currently imperceptible; it becomes the thing to fix if a project ever reaches hundreds of revisions.

**Where.** `server/db.py` (add a single `project_tree_rows(project_id)` if ever measured).

**How.** Only if data grows: three aggregate queries (all designs; all vizes of those designs; all revisions of those vizes) joined in Python by id keys. Until then: leave it. ponytail ceiling: fine below ~1k revision rows / project.

---

## Implementation status (implemented from this document)

All B-series findings and I1 are implemented and covered by runnable checks.
I2 and I3 remain deliberate no-actions, as argued above.

| Item | Status | Where |
| --- | --- | --- |
| B1 render unlink on project delete | done | `server/db.py::delete_project` (UNION of design + revision paths) |
| B2 current-revision repoint | done | `server/main.py::delete_revision` |
| B3 worker resilience + stale-job recovery | done | `server/main.py::_worker`, `server/db.py::recover_stale_jobs` (called at startup) |
| B4 centre-crop resize | done | `server/main.py::_resize` (`ImageOps.fit`) |
| B5 prompt_builder test import / convention | done | `server/test_prompt_builder.py` — decided on the sibling `-m` convention, no new dependency |
| B6 polling deadline | done | `src/api.ts::pollUntil` (15min default, overridable) |
| B7 upload cap + verification | done | `server/main.py::_read_upload` (413 oversize, 400 garbage, true extension) |
| I1 reference data URL kept out of payloads | done | worker `params.pop("image_url")`, `_public_params` in `get_job`/`project_tree` |
| I2 polling architecture | no action | by design, per above |
| I3 project_tree N+1 | no action | below the measured threshold, per above |

Two additional changes fell out of implementing B2/checking lint, both matching
sibling code for consistency:

- `server/main.py::delete_revision` now basenames the stored path before
  unlinking, like `delete_design`/`delete_project` already did.
- `server/db.py::_migrate` binds the table name via `pragma_table_info(?)` and
  uses static DDL strings, so no interpolation reaches SQL.

Verification after the changes (same commands as the table at the top):

| Check | Result |
| --- | --- |
| `.venv/bin/python -m server.test_lifecycle` | PASS — `lifecycle ok (B1 B2 B3 B4 B7 I1)` |
| `.venv/bin/python -m server.test_prompt_builder` | PASS — `prompt_builder ok (29 checks)` (was failing) |
| `.venv/bin/python -m server.test_geometry` | PASS |
| `.venv/bin/python -m server.test_aspect` | PASS |
| `.venv/bin/python -m server.test_projects` | PASS |
| `npm run build` | PASS |

The uncommitted geometry lock that was in the working tree when this review
ran is now committed alongside the B-series server fixes (main.py imports it,
so it had to land together), with the reasoning recorded in that commit.

---

## Post-implementation review (review of the changes above)

Each fix was re-diffed against its How-sketch and probed empirically.

| Item | Verdict | Evidence |
| --- | --- | --- |
| B1 | matches the sketch exactly (UNION in `db.py`, `main.py` unchanged) | full diff re-read; `test_lifecycle` asserts the render file is gone | 
| B2 | matches; one extra line (basename the path before unlink, like `delete_design`) | diff; test asserts repoint, then NULL when the last revision goes | 
| B3 | one deviation from the sketch: queued jobs are **failed**, not requeued — their `api_key` only lived in the dead process (only a server-wide env `OPENROUTER_API_KEY` could requeue them). Rationale + upgrade path recorded in the docstring's ponytail comment | worker try-wrap in diff; B3 check asserts `status='failed'`, `error` mentions restart | 
| B4 | matches (`ImageOps.fit`, format/size short-circuit preserved) | red-band 200x100 → 100x100 test proves crop, not stretch | 
| B5 | matches; run-under-`-m` main block iterates every `test_*` symbol | 29 checks pass | 
| B6 | matches; `App.runRender` needs no change because the deadline has a default | `tsc --noEmit` exit 0 | 
| B7 | matches (cap, byte-verify, true extension); re-encode skipped as the doc allowed and extra bomb hardening added (below) | upload check: garbage 400, bomb 400, oversize 413, `.dat` stores as `.png` | 
| I1 | matches; a side-check asserts the job *row* still carries the reference (only the API responses strip it) so the worker keeps working | `data:` absent from `get_job`/`project_tree` JSON, present in the row, revision params stripped | 
| I2 / I3 | no action, as argued in their sections | — |

Issue found **and fixed** during this review:

- `_read_upload` (B7's new code) did not catch `PIL.Image.DecompressionBombError`:
  a ~70-byte PNG whose IHDR declares 40000x40000 (1.6B px > Pillow's 178.9M
  limit, Pillow 12.3) escaped as an unhandled exception → HTTP 500. Probed
  empirically, then fixed to 400 ("Image is too large to process") with a
  crafted-bomb case in `server/test_lifecycle.py`.

Observations (no action taken, all cosmetic or environment-specific):

- `test_lifecycle`'s B2 block leaves its scratch rows to the *next* block's
  `delete_project(pid)` (they share `pid`). Works while blocks run in order,
  but a run that crashes mid-block leaks scratch rows — observed in practice
  when the (then-failing) bomb case aborted the run. Fixed to self-heal: the
  check now deletes any pre-existing `zz-review-scratch` projects at the top,
  so a crashed run no longer leaves residue behind for later runs.
- The worker's new try-wrap and the `params.pop("image_url")` are verified by
  inspection, not at runtime: the worker loop is long-lived and not directly
  callable in a check without a live OpenRouter key. End-to-end coverage would
  require a stubbed `or_.generate`.
- Dev-hazard to know about: `server/test_lifecycle.py` (and any import of
  `server.main`) runs `recover_stale_jobs()`, which fails any `queued`/`running`
  rows in the shared dev DB — including those of a concurrently running dev
  server. Recorded here so nobody is surprised.

