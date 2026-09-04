"""Aspect-ratio snap sanity: run `.venv/bin/python -m server.test_aspect`."""

from server.openrouter import ASPECT_RATIOS
from server.openrouter import closest_aspect_ratio as c

# common dims snap to the obvious ratio
assert c(1920, 1080) == "16:9", c(1920, 1080)
assert c(1080, 1920) == "9:16", c(1080, 1920)
assert c(1024, 1024) == "1:1"
assert c(4000, 3000) == "4:3"

# log-distance keeps orientations symmetric
assert c(1000, 2000) == "1:2", c(1000, 2000)
assert c(2000, 1000) == "2:1", c(2000, 1000)

# panorama + mobile-exotic ratios exist in the table
assert c(2100, 900) == "21:9", c(2100, 900)
assert c(1170, 2532) == "9:19.5", c(1170, 2532)

# near-misses go to the closest option (1.35 -> 4:3)
assert c(1350, 1000) == "4:3", c(1350, 1000)

# every listed ratio parses and is unique
assert len(set(ASPECT_RATIOS)) == len(ASPECT_RATIOS)

print("aspect snap ok")
