// Self-check for the aspect-ratio snapping logic (node scripts/check_ratios.ts)
import assert from "node:assert";
import { ASPECT_RATIOS, closestAspectRatio } from "../src/api.ts";

// the table must match the OpenRouter Image API's normalized aspect_ratio enum
// (https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
assert.equal(ASPECT_RATIOS.length, 17);

assert.equal(closestAspectRatio(1000, 1000), "1:1");
assert.equal(closestAspectRatio(1920, 1080), "16:9");
assert.equal(closestAspectRatio(1080, 1920), "9:16");
assert.equal(closestAspectRatio(8000, 1000), "8:1");
assert.equal(closestAspectRatio(6016, 3384), "16:9"); // 16:9-ish photo
// log-distance keeps orientations symmetric
assert.equal(closestAspectRatio(2000, 1000), "2:1");
assert.equal(closestAspectRatio(1000, 2000), "1:2");
// phone-screen 19.5:9 snaps to the nearest supported ratios
assert.equal(closestAspectRatio(2340, 1080), "21:9");
assert.equal(closestAspectRatio(1080, 2340), "9:21");
// tall portrait between 9:16 and 1:2 snaps to 9:16
assert.equal(closestAspectRatio(1080, 2016), "9:16");
// taller (1080x2300) snaps to 1:2 — boundary to 9:21 sits at ~0.463 (log mid)
assert.equal(closestAspectRatio(1080, 2300), "1:2");

// same snapping with the app's tolerance: 3:1 sits >0.25 log from 21:9/4:1
assert.equal(closestAspectRatio(3000, 1000, 0.25), "auto");
assert.equal(closestAspectRatio(1920, 1080, 0.25), "16:9");
assert.equal(closestAspectRatio(1080, 2340, 0.25), "9:21");
assert.equal(closestAspectRatio(4500, 1000, 0.25), "4:1"); // in tol

console.log("ratio self-check ok");
