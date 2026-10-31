"""Geometry lock: make the reference building win by construction.

The prompt *asks* the model to keep the geometry (see environment_base /
fidelity.strict in prompts.json). It does not bind it — an atmosphere prompt
needs scene-wide depth and relighting, so the model re-synthesises walls,
windows and roofs to match. This module binds it instead: paste the
reference's building silhouette back over the generated image, so the
building is the reference's pixels and the atmosphere only survives where
the building isn't.

Silhouette = everything NOT reachable from the image border through
similar-coloured pixels. Works for the MVP inputs (SketchUp screenshots,
clay/material renders) where the site is plain sky/ground and the building
is the contrasting blob. Pure Pillow: no numpy, no segmentation model.

ponytail: pasting freezes the building's *appearance* too, so materials and
lighting on the building come from the reference, not the model. A flat
mean-colour offset (per channel) is applied to the pasted patch so it sits
in the generated lighting. Ceiling: colour/lighting mismatch on a strong
change (day→night). Upgrade path is a frequency composite (keep generated
low-frequency, restore reference edges) instead of a paste.
"""

from collections import deque
from io import BytesIO

from PIL import Image, ImageFilter, ImageStat

CAP = 384  # matte + drift work at this max dimension; cheap, plenty precise
BG_TOLERANCE = 40  # manhattan RGB step that still counts as "same surface"
MIN_COVERAGE, MAX_COVERAGE = 0.02, 0.98  # outside this the matte failed


def _cap(img, cap=CAP):
    """Downscale to `cap` on the long edge (keeps aspect)."""
    if max(img.size) <= cap:
        return img
    s = cap / max(img.size)
    return img.resize(
        (max(1, round(img.width * s)), max(1, round(img.height * s))),
        Image.Resampling.BILINEAR,
    )


def building_mask(ref, tolerance=BG_TOLERANCE, cap=CAP):
    """(foreground mask at capped size, coverage 0..1) for a reference render.

    Border flood fill stepping through similar colours: a smooth sky gradient
    fills, a hard building edge stops. No false confidence — a leaked or
    failed matte collapses toward coverage 0/1 and protect_geometry declines.
    """
    small = _cap(ref.convert("RGB"), cap)
    w, h = small.size
    px = small.load()
    bg = bytearray(w * h)
    q = deque()

    def seed(x, y):
        i = y * w + x
        if not bg[i]:
            bg[i] = 1
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y = q.popleft()
        c = px[x, y]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not bg[i]:
                    d = px[nx, ny]
                    step = abs(c[0] - d[0]) + abs(c[1] - d[1]) + abs(c[2] - d[2])
                    if step <= tolerance:
                        bg[i] = 1
                        q.append((nx, ny))

    buf = bytearray(w * h)
    fg = 0
    for i in range(w * h):
        if not bg[i]:
            buf[i] = 255
            fg += 1
    return Image.frombytes("L", (w, h), bytes(buf)), fg / (w * h)


EDGE = 32  # FIND_EDGES magnitude above which a pixel counts as structure


def _drift(ref_small, gen_small, mask):
    """0..1 structural mismatch inside the building mask.

    Reference edges with no counterpart in the generated image (geometry
    erased) and generated edges with none in the reference (geometry added),
    as a fraction of all structure. Both edge maps are dilated 1px first so a
    sub-pixel misalignment is not counted. Relighting also moves edge
    contrast, so this is a smoke detector (warn), not a gate — the paste is
    applied regardless. A flat-pixel mean would be ~0 for a moved wall, which
    is why this counts structure instead.
    """
    a = ref_small.convert("L").filter(ImageFilter.FIND_EDGES)
    b = gen_small.convert("L").filter(ImageFilter.FIND_EDGES)
    da = a.filter(ImageFilter.MaxFilter(3)).load()  # dilation = tolerance
    db = b.filter(ImageFilter.MaxFilter(3)).load()
    pa, pb = a.load(), b.load()
    # Sample a dilated mask: the FIND_EDGES response for the silhouette lands
    # on the *background* pixel beside the wall, just outside the pasted mask.
    m = mask.filter(ImageFilter.MaxFilter(7)).load()
    w, h = mask.size
    missing = added = total = 0
    for i in range(w * h):
        x, y = i % w, i // w
        if not m[x, y]:
            continue
        ea, eb = pa[x, y] > EDGE, pb[x, y] > EDGE
        if ea:
            total += 1
            if not db[x, y] > EDGE:
                missing += 1
        if eb:
            total += 1
            if not da[x, y] > EDGE:
                added += 1
    return (missing + added) / total if total else 0.0


def _mean_offset(ref, gen, mask):
    """Per-channel (generated - reference) mean over the building, so the
    pasted patch roughly matches the generated lighting instead of the
    reference's."""
    r = ImageStat.Stat(ref, mask).mean
    g = ImageStat.Stat(gen, mask).mean
    return [gi - ri for ri, gi in zip(r, g, strict=True)]


def _shift(img, offsets):
    """Add signed per-channel offsets to an RGB image, clamped."""
    chans = []
    for i, off in enumerate(offsets):
        o = round(off)
        ch = img.getchannel(i)
        chans.append(ch if o == 0 else ch.point(lambda v, o=o: max(0, min(255, v + o))))
    return Image.merge("RGB", chans)


def protect_geometry(reference, generated, tolerance=BG_TOLERANCE, feather=3):
    """Paste the reference building back over `generated`.

    reference/generated: PNG/JPEG bytes. The generated image is scaled to the
    reference's size (the camera is meant to be preserved, so they align).
    Returns (png bytes, info dict with protected/coverage/drift/offset).
    """
    ref = Image.open(BytesIO(reference)).convert("RGB")
    gen = (
        Image.open(BytesIO(generated))
        .convert("RGB")
        .resize(ref.size, Image.Resampling.LANCZOS)
    )

    small_mask, coverage = building_mask(ref, tolerance)
    protected = MIN_COVERAGE <= coverage <= MAX_COVERAGE
    # ref and gen share a size here, so they cap to identical dims.
    drift = _drift(_cap(ref), _cap(gen), small_mask)

    info = {
        "protected": protected,
        "coverage": round(coverage, 3),
        "drift": round(drift, 3),
        "offset": None,
    }

    if protected:
        hard = small_mask.resize(ref.size, Image.Resampling.NEAREST)
        offsets = _mean_offset(ref, gen, hard)
        info["offset"] = [round(o, 1) for o in offsets]
        soft = hard.filter(ImageFilter.GaussianBlur(feather))
        out = gen.copy()
        out.paste(_shift(ref, offsets), (0, 0), soft)
    else:
        # No usable matte (building touches the border, background and
        # building share a colour, uniform reference). Better to ship the
        # model's image than to paste a wrong mask.
        out = gen

    buf = BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue(), info
