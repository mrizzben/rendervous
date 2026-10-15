"""Geometry lock sanity: run `.venv/bin/python -m server.test_geometry`."""

from io import BytesIO

from PIL import Image, ImageDraw

from server.geometry import building_mask, protect_geometry


def _ref():
    """Plain background + a dark building rectangle (the immovable part)."""
    im = Image.new("RGB", (200, 150), (205, 205, 205))
    ImageDraw.Draw(im).rectangle([60, 40, 140, 120], fill=(60, 60, 60))
    return im


def _png(im):
    b = BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def _pixel(img, xy):
    """getpixel with the tuple narrowed (Pillow stubs: int | tuple | None)."""
    px = img.getpixel(xy)
    assert isinstance(px, tuple), px
    return px


ref = _ref()

# The matte finds the building blob: 80*80 of 200*150.
mask, coverage = building_mask(ref)
assert 0.15 < coverage < 0.30, coverage
assert mask.getpixel((100, 80)) == 255  # building
assert mask.getpixel((10, 10)) == 0  # background

# The model shortened the wall (top now at y=70) and painted trees around it.
gen = Image.new("RGB", (200, 150), (90, 140, 60))
ImageDraw.Draw(gen).rectangle([60, 70, 140, 120], fill=(80, 80, 80))

out, info = protect_geometry(_png(ref), _png(gen))
assert info["protected"] is True, info
assert info["drift"] > 0.15, info  # shortened wall must register as drift

# Identical geometry registers as aligned.
_, same = protect_geometry(_png(ref), _png(ref))
assert same["drift"] < 0.05, same
img = Image.open(BytesIO(out)).convert("RGB")

# The missing wall top comes back: (100, 45) was sky in the generated image,
# and must now be the dark reference building (plus lighting offset), not green.
px = _pixel(img, (100, 45))
assert px[0] < 120 and px[1] < 120, px  # never the green sky

# Environment survives where the building isn't.
bg = _pixel(img, (10, 10))
assert bg[1] > bg[0] and bg[1] > bg[2], bg  # still green

# Failed matte -> decline, ship the model's image untouched.
flat = Image.new("RGB", (80, 80), (128, 128, 128))
_, flat_cov = building_mask(flat)
assert flat_cov < 0.02 or flat_cov > 0.98, flat_cov
out2, info2 = protect_geometry(_png(flat), _png(ref.resize((80, 80))))
assert info2["protected"] is False, info2

print("geometry lock ok", info)
