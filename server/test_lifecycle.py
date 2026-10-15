"""Lifecycle integrity checks: run `.venv/bin/python -m server.test_lifecycle`.

Covers the REVIEW.md fixes that a shape/sanity test cannot:
  B1 project delete unlinks revision renders (not just references)
  B2 deleting the current revision repoints current_revision_id
  B3 recover_stale_jobs fails zombie queued/running rows on startup
  B4 _resize center-crops instead of stretching the aspect
  B7 uploads are size-capped and byte-verified (real extension, garbage 400)
  I1 no base64 reference data URL in API payloads

Creates and deletes its own scratch rows/files, so it is safe to re-run.
"""

import asyncio
import io
import json
import os
import struct
import zlib

from fastapi import HTTPException, UploadFile
from PIL import Image

from server import db
from server.main import (
    _resize,
    delete_project,
    delete_revision,
    get_job,
    project_tree,
    upload_design,
)


def _png(size=(32, 32), color=(120, 120, 120)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def _bomb_png(width=40000, height=40000) -> bytes:
    """PNG header declaring huge dims; no pixel data is ever shipped."""

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(
            ">I", zlib.crc32(c) & 0xFFFFFFFF
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    idat = zlib.compress(b"\x00\x00" * 8)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


def _store(data: bytes) -> str:
    """Write bytes into IMAGES_DIR the way the worker does; return the name."""
    name = db.new_image_path("png")
    with open(os.path.join(db.IMAGES_DIR, name), "wb") as f:
        f.write(data)
    return name


def _path(name: str) -> str:
    return os.path.join(db.IMAGES_DIR, name)


def _scratch():
    """project + design reference + one visualization."""
    pid = db.create_project("zz-review-scratch")
    ref = _store(_png())
    did = db.create_design(pid, "Reference", ref)
    viz = db.create_visualization(did, "Renders", "{}")
    return pid, ref, viz


def _upload(pid, data: bytes, filename="x.png"):
    return asyncio.run(
        upload_design(
            pid, "ref", UploadFile(file=io.BytesIO(data), filename=filename)
        )
    )


# Self-heal: a run that crashes mid-block (or user interruption) can leave
# scratch rows and files behind; clear them before creating new ones.
for _row in db.list_projects(include_archived=True):
    if _row["name"] == "zz-review-scratch":
        delete_project(_row["id"])


# --- B4: _resize center-crops, never stretches -------------------------------
# 200x100 source: green, with a red band 10px from the left edge. Cropping the
# centre to 100x100 (x 50..150) must drop the band; a stretch would keep it.
band = Image.new("RGB", (200, 100), (0, 200, 0))
for x in range(10, 20):
    for y in range(100):
        band.putpixel((x, y), (255, 0, 0))
buf = io.BytesIO()
band.save(buf, "PNG")
out = Image.open(io.BytesIO(_resize(buf.getvalue(), 100, 100))).convert("RGB")
assert out.size == (100, 100), out.size
hist = out.split()[0].histogram()  # red-channel histogram, 256 buckets
assert sum(hist[60:]) == 0, ("red band survived: stretched, not cropped", hist[60:])

# --- B1 + I1: project delete unlinks renders; payloads carry no data URL -----
pid, ref, viz = _scratch()
render = _store(_png((16, 16)))
rev = db.create_revision(viz, None, "v1", "p", "", "m", "{}", render)
job = db.create_job(
    "m", "p", json.dumps({"image_url": "data:image/png;base64,AAAA", "width": 8}), None
)
public = json.dumps(get_job(job))
assert "data:" not in public, "I1: job payload still carries the reference data URL"
assert db.get_job(job)["params"].count("data:") == 1, "job row lost the worker's reference"
db.conn().execute("DELETE FROM jobs WHERE id=?", (job,))
db.conn().commit()

# I1 defensive half: rows written before the fix are stripped on read.
db.create_revision(
    viz,
    None,
    "v1",
    "p",
    "",
    "m",
    json.dumps({"image_url": "data:image/png;base64,AAAA"}),
    _store(_png()),
)
tree = project_tree(pid)
assert "data:" not in json.dumps(tree), "I1: project tree still carries the reference"
assert tree["designs"][0]["visualizations"][0]["revisions"][0]["params"] == {}, tree

delete_project(pid)
assert not os.path.exists(_path(ref)), "B1: design reference file survived"
assert not os.path.exists(_path(render)), f"B1: revision render survived (rev {rev})"

# --- B2: deleting the current revision repoints current_revision_id ----------
pid, ref, viz = _scratch()
first = db.create_revision(viz, None, "v1", "p", "", "m", "{}", _store(_png()))
second = db.create_revision(viz, first, "v2", "p", "", "m", "{}", _store(_png()))
db.set_current_revision(viz, second)
delete_revision(second)
assert db.get_visualization(viz)["current_revision_id"] == first, "B2: not repointed"
delete_revision(first)
assert db.get_visualization(viz)["current_revision_id"] is None, "B2: not cleared"

# --- B7: uploads are capped and byte-verified --------------------------------
got = _upload(pid, _png((8, 8)), filename="renamed.dat")
assert got["image_url"].endswith(".png"), got  # bytes decide the format

for payload, expected, label in (
    (b"#!/bin/sh\necho hi\n", 400, "non-image"),
    (_bomb_png(), 400, "pixel bomb"),
    (b"\x89PNG\r\n\x1a\n" + b"0" * (10 * 1024 * 1024 + 1), 413, "oversize"),
):
    try:
        _upload(pid, payload, filename="payload.png")
    except HTTPException as e:
        assert e.status_code == expected, (label, e.status_code)
    else:
        raise AssertionError(f"B7: {label} upload accepted")

delete_project(pid)

# --- B3: zombie jobs are failed on startup, not left queued/running ---------
zombie = db.create_job("m", "p", "{}", None)
db.set_job_running(zombie)
assert db.recover_stale_jobs() >= 1, "B3: no zombie rows failed"
assert db.get_job(zombie)["status"] == "failed", db.get_job(zombie)["status"]
assert "restarted" in db.get_job(zombie)["error"]
db.conn().execute("DELETE FROM jobs WHERE id=?", (zombie,))
db.conn().commit()

print("lifecycle ok (B1 B2 B3 B4 B7 I1)")
