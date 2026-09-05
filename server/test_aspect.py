"""Aspect-ratio snap sanity: run `.venv/bin/python -m server.test_aspect`."""

from server.openrouter import ASPECT_RATIOS, _accepted_ratios
from server.openrouter import closest_aspect_ratio as c
from server.openrouter import closest_ratio_to as snap

# common dims snap to the obvious ratio
assert c(1920, 1080) == "16:9", c(1920, 1080)
assert c(1080, 1920) == "9:16", c(1080, 1920)
assert c(1024, 1024) == "1:1"
assert c(4000, 3000) == "4:3"

# log-distance keeps orientations symmetric
assert c(1000, 2000) == "1:2", c(1000, 2000)
assert c(2000, 1000) == "2:1", c(2000, 1000)

# panorama + phone-screen ratios snap to the nearest supported option
assert c(2100, 900) == "21:9", c(2100, 900)
assert c(1170, 2532) == "9:21", c(1170, 2532)

# near-misses go to the closest option (1.35 -> 4:3)
assert c(1350, 1000) == "4:3", c(1350, 1000)

# every listed ratio is in the OpenRouter Image API's normalized enum
# (https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
ACCEPTED = {
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "4:5",
    "5:4",
    "1:2",
    "2:1",
    "1:4",
    "4:1",
    "1:8",
    "8:1",
    "9:21",
    "21:9",
}
assert set(ASPECT_RATIOS) <= ACCEPTED, set(ASPECT_RATIOS) - ACCEPTED
assert len(set(ASPECT_RATIOS)) == len(ASPECT_RATIOS)

# --- provider-rejection recovery -------------------------------------------

# the exact shape OpenRouter returned for google/gemini-3.1-flash-image
REAL = (
    "No provider for google/gemini-3.1-flash-image supports the requested "
    'parameter(s): aspect_ratio "19.5:9", output_format "png", n "1", '
    "input_references (1 items). Provider rejections: Google AI Studio: "
    "aspect_ratio: not supported. Accepted: 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, "
    "4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9 | Google: aspect_ratio: not "
    "supported. Accepted: 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, "
    "8:1, 9:16, 16:9, 21:9"
)
accepted = _accepted_ratios(REAL)
assert len(accepted) == 14 and accepted[0] == "1:1" and accepted[-1] == "21:9", accepted
# 19.5:9 snaps to the nearest accepted ratio (21:9 landscape / 9:16 portrait)
assert snap("19.5:9", accepted) == "21:9", snap("19.5:9", accepted)
assert snap("9:19.5", accepted) == "9:16", snap("9:19.5", accepted)
# an already-accepted ratio is untouched (generate() checks before snapping)
assert snap("16:9", accepted) == "16:9"
# unparseable messages yield [] so generate() fails with the original error
assert _accepted_ratios("some other 400 message") == []
assert _accepted_ratios("") == []

print("aspect snap ok")
