# RESEARCH — How professional archviz render software works, and what Rendervous can steal

*How Lumion, V-Ray, Corona, Enscape, D5 and Twinmotion parameterize a render —
and how those parameters map onto Rendervous' prompt-steered pipeline.*

---

## 1. What the tools actually do

Rendervous is not a rasterizer/path tracer — it steers an image model with a
reference image. But the *parameters* of real renderers are distilled from 20
years of what makes archviz look right, and image models were trained on
images produced with them. Studying their control surfaces tells us exactly
which knobs matter and in which words to express them.

### 1.1 V-Ray (offline path tracer — the "ground truth" parameter set)

**V-Ray Sun & Sky system** (`VRaySun`):

- **Sun position: azimuth + elevation** — the single most important lighting
  control in archviz. Not "daylight vs sunset" but *where the sun is*.
- **Ozone (0.0–1.0)**: < 0.5 warmer/yellower sunlight, > 0.5 cooler/bluer —
  controls the hue of direct sun independently of time of day.
- **Turbidity**: atmospheric haze/dust; drives how washed-out or crisp the
  scene and sky look.
- **Sun size multiplier**: bigger sun disc → softer shadows.

**V-Ray Physical Camera** (`VRayPhysicalCamera`) — a real camera, not a

viewport:

- **Focal length** (interiors: 24–35mm; details: 50–85mm; many pros avoid
  < 30mm for distortion).
- **F-stop** (aperture): exposure + depth of field. Exterior archviz
  convention: start around **f/8**.
- **Shutter speed, ISO** (commonly ISO 100–250): the other exposure legs.
- **White balance**: the scene's color-temperature baseline.
- Community workflow: exposure is balanced *in camera*, then final grading
  happens in post on a 32-bit linear render.

### 1.2 Lumion (real-time, effect-stack based)

Lumion's Photo Mode is a **stacked effect pipeline** — order matters, higher
effects override lower ones. Recommended realism stack:

1. **Ray Tracing**
2. **Materials**
3. **Lighting** (Sun, Real Skies, Hyperlight)
4. **Color Correction**

Key effects, by category:

- **Sun effect**: Sun Height, Sun Heading (direction), Sun Disk Size.
- **Real Skies**: pre-captured HDRI skies that drive the lighting, not just
  the backdrop — the sky *is* the light source.
- **Hyperlight**: sky-driven global illumination; users typically run it at
  **25–50%** — more light bounce = softer, brighter ambient.
- **2-Point Perspective**: corrects converging verticals. *This is the
  signature archviz "look" — vertical lines stay perfectly vertical.*
- **Sky/Weather**: Sky & Clouds, Fog, Wind, Precipitation, Volume clouds.
- **Post**: Color Correction (Lumion 2024+), Bloom, God Rays, Volumetric
  Sunlight, Reflection, Photo Matching.
- Documented warning: too many effects / over-adjusting **ruins
  photorealism** — restraint is part of the look.

### 1.3 Corona Renderer (the "archviz look" people actually copy)

Corona is popular precisely because its defaults look like archviz. Its
signature post stack:

- **Tone mapping with Highlight Compression** — balances bright skies against
  darker interiors; the #1 knob for "materials suddenly look realistic".
- **Bloom & Glare** — one-click photographic highlight bloom.
- **LUTs** — community grade presets (e.g. "Kim Amlan" LUTs are famous).
- Same physical camera model as V-Ray (ISO/f-stop/shutter, white balance).

### 1.4 Enscape / D5 / Twinmotion (real-time, preset-first)

- All expose **time of day** as a slider (sun follows a real arc) plus
  **weather** (clouds, fog, precipitation) and **season**.
- **Twinmotion**: sun *temperature* control, ambience presets, weather/HDRIs.
- **D5**: AI post-processing (auto shadow/light/texture enhancement), path
  tracing mode for finals.
- **Enscape**: minimal controls by design — presets over parameters.

### 1.5 Archviz photography conventions (what the images have in common)

- **Straight verticals** (tilt-shift / lens shift / 2-point perspective) —
  non-negotiable in professional archviz.
- **Exposure discipline**: no blown highlights, shadow detail preserved;
  high-contrast scenes balanced via layer masking in post.
- **Neutral white balance** except when golden/blue hour is the point.
- **Focal length discipline**: 24–35mm interiors, 35–55mm general, 50–85mm
  details; no fisheye wide-angle distortion.
- **Golden hour** = sun ~5–12° above the horizon (long soft shadows, warm
  color temperature); daytime = sun above 6°…45°+.
- **Entourage**: people, cars, vegetation are almost always present —
  they provide scale and life. Pure empty buildings read as renders.

---

## 2. The canonical parameter taxonomy

E ver y  se rious tool converges on the same groups (paraphrased across V-Ray /
Lumion / Corona / Twinmotion):

| Group | Parameters |
| --- | --- |
| **Sun & Sky** | azimuth, elevation, disk size (shadow softness), turbidity/haze, ozone/sun hue, sky type (HDRI) |
| **Environment** | weather (fog, rain, snow), season, wind, vegetation/entourage |
| **Camera** | focal length, f-stop/DOF, ISO/shutter (exposure), white balance, verticals correction |
| **Materials** | albedo, roughness/gloss, patina/weathering, reflectivity, bump |
| **Post / Grade** | tone mapping, highlight compression, bloom/glare, vignette, LUT, saturation/contrast, vignette |
| **Light transport** | GI intensity (Lumion "Hyperlight"), AO, contact shadows, reflections |

**The meta-lesson**: real tools give *continuous physical parameters*
(sun elevation, f/8, 35mm, 5000K), not just categorical presets. Presets in
Enscape/Twinmotion exist for convenience but map onto physical values
underneath.

---

## 3. Gap analysis — Rendervous today vs. the taxonomy

C urr e nt  c ont rols (`src/options.ts`, `server/prompt_builder.py`,
`server/prompts.json`):

| Taxonomy group | Rendervous today | Gap |
| --- | --- | --- |
| Sun & Sky | 5 lighting presets (daylight/overcast/golden/sunset/night) | **No sun direction** (the biggest missing lever — raking vs frontal light changes everything), no haze/sky detail, no shadow softness |
| Environment | 4 biome presets (none/tropical/urban/forest) | **No season, no weather** (rain/snow/fog), no entourage (people/cars) |
| Camera | one generic "preserve camera" line | **No focal length, no DOF, no verticals correction, no white balance** |
| Materials | 4 chips (concrete/wood/stone/custom) | Chips pick *what*, nothing controls *finish* — matte vs polished, weathered vs new |
| Post / Grade | 4 style presets (photoreal/editorial/minimal/atmospheric) | Reasonable! Could gain an intensity dimension |
| Light transport | covered in `lighting_base` (AO, contact shadows, GI) | OK as-is |

Two structural gaps, not just missing chips:

1. **Verticals correction is free and high-impact.** Lumion ships an entire
   effect for it; every archviz photo has it; a diffusion model will happily
   obey "keep all vertical lines perfectly vertical, two-point perspective".
   One sentence in the prompt improves *perceived geometry fidelity* — which
   is the product's core promise — without touching the geometry section.
2. **Presets hide the axes.** "Golden hour" bundles three independent
   variables (sun elevation ~8°, warm sun hue, long shadows). The custom
   instruction textarea is where users currently hand-write what chips can't
   express — meaning the chips are underspecified, not that users want
   prose.

---

## 4. Recommendations (prioritized)

All changes are prompt-language only — no pipeline changes needed. Files:
`server/prompts.json`, `server/prompt_builder.py`, `src/options.ts`,
`src/components/VisualizePanel.tsx`, `src/api.ts` (`Settings`).

### P0 — cheap, high impact

1. **Verticals correction** — add to the template's CAMERA section
   (`prompts.json`): "Two-point perspective: keep all vertical lines of the
   building perfectly vertical and parallel in the image; do not tilt or
   converge them upward." This is the archviz signature look and directly
   supports the geometry-preservation story. One line. Ship this first.

2. **Sun direction** — add a light-direction control (e.g. chips:
   Auto / Front / Left / Right / Behind, or a compass slider) that renders
   into the LIGHTING section as physical language: "sun low in the
   western sky, raking across the facade from the left, long shadows
   falling right". Raking light reveals form; frontal light flattens it —
   users will feel this instantly.

3. **Sun elevation inside the lighting presets** — refine existing presets
   with degrees: daylight → "sun 45–60° above the horizon, short crisp
   shadows"; golden hour → "sun ~8° above the horizon" (Wikipedia/PhotoPills
   golden hour ≈ 5–12°); night → "sun well below horizon". Numbers are the
   vocabulary image models understand best.

4. **Camera focal length + DOF** — two small controls: focal length
   (24 / 35 / 50 / 85mm) and DOF (off / subtle / strong, expressed as f/2.8
   – f/8 – f/16). Renders as "shot on a 35mm lens at f/8". Interiors want
   24–35mm; details want 50–85mm. This is exactly how V-Ray/Corona users
1  think, and the phrases appear verbatim in training data.

### P1 — rounds out the presets

1. **Season + weather** (Environment group): season chips (summer/autumn/
   winter/spring → prompt: bare branches, autumn foliage, snow on
   horizontal surfaces) and weather chips (clear / overcast / light fog /
2  rain / snow). Maps Lumion's Precipitation + Fog + Twinmotion seasons.
   Fog is also the archviz depth cue: "atmospheric haze increasing with
   distance".

2. **Finish/material quality slider** (Materials group): matte ↔ polished ↔
3  weathered — "board-formed concrete with matte finish" vs "polished
   reflective stone with visible patina". Decouples *what* the material is
   from *how it reads*, which is what V-Ray's roughness/IOR controls do.

3. **Sky type** (Sun & Sky): clear blue / scattered clouds / dramatic
   overcast clouds / hazy — Lumion's Real Skies lesson: describe the sky and
   let it drive the light ("soft light bouncing from an overcast sky").

4. **Grade intensity** for the Style presets (Atmospheric 0–100): maps
   Corona's LUT + highlight compression. Low = subtle, high = cinematic.
   Ponytail check: the style presets already encode grades; this only
1  intensifies them — if chips feel like enough, skip.

### P2 — polish, only if asked for

2

1. **White balance slider** (3000–7500K) for non-night scenes — mirrors
   camera white balance; the lamp-temperature control already exists for
   artificial light, this is its daylight sibling.
2. **Entourage density** (empty / light / lively): "a few pedestrians for
    scale, one car passing" — scale cues are why renders read as photos.
    Overlaps with Environment; could be one chip there instead of a slider.

### Explicitly not worth doing

- Real numeric GI/AO/ray-tracing parameters: image models don't consume
  render-engine settings; AO/contact shadows are already covered in
  `lighting_base`.
- Per-material pickers per surface: the reference image carries the design's
  material layout; a global finish slider covers the rest.
- ISO/shutter as separate sliders: exposure is one number the model
  infers from lighting; f-stop only matters via DOF, which P0.4 covers.

---

## 4b. IMPLEMENTED — Advanced Configs panel (P0.1–P0.4)

Shipped as a collapsible **Advanced configs** section in the Visualize
panel (`VisualizePanel.tsx`). Every control defaults to **auto** (unset):
preset wording stands alone until an advanced value overrides it, matching
the "differentiate presets from advanced options" requirement.

| Control | UI | Values | Prompt translation |
|---|---|---|---|
| Sun direction | chips | Auto / Front / Left / Right / Behind | raking vs frontal/backlit language (e.g. "raking across the facade, shadows toward the right") |
| Sun elevation | slider | Auto, 0–90° | "Override the default sun height: place the sun exactly N° above the horizon." |
| Focal length | chips | Auto / 16 / 24 / 35 / 50 / 85mm | "Shot on a 35mm lens…" |
| Aperture | chips | Auto / f/2.8–f/16 | "…at f/8, sharp focus across the frame" (+ DOF note for f/2.8–f/4) |

Range rationale (researched):

- **Elevation 0–90°** is the full physical range: 0° = sun on the horizon,
  90° = directly overhead (solar noon). Slider is enabled only for the
  sun-lit presets (daylight / golden hour / sunset) — overcast and night
  have no visible sun. Preset defaults now bake in researched numbers:
  daylight 45–60°, golden hour 6–10° (Wikipedia/PhotoPills put golden hour
  at 5–12°), sunset 0–5°.
- **Focal lengths 16/24/35/50/85mm** cover architecture-photography
  standards: 17–24mm is tilt-shift territory (interiors, wide exteriors;
  Canon TS-E 24mm is the classic), 35mm general, 50mm natural perspective,
  85mm details. Ultra-wides (<16mm) distorted and were left out.
- **F-stops 2.8/4/5.6/8/11/16**: f/8–f/11 is the sharpness sweet spot for
  archviz (community standard, also V-Ray exterior convention ~f/8);
  f/2.8–f/4 gives shallow DOF; f/16 is the deepest focus before diffraction
  softening sets in.

Files: `server/prompts.json`, `server/prompt_builder.py`,
`server/test_prompt_builder.py`, `src/options.ts`, `src/api.ts`,
`src/components/VisualizePanel.tsx`, `src/styles.css`.

P0 items 2–3 (sun direction, elevation in presets) and item 4 (lens +
f-stop) are done. Item 1 of the original RESEARCH list (verticals
correction sentence in the camera section) remains open — one line,
still worth shipping.

---

## 5. Sources

- V-Ray Physical Camera docs — documentation.chaos.com (`VRayPhysicalCamera`)
- V-Ray Sun & Sky docs — documentation.chaos.com (`VRaySun`, ozone/turbidity)
- Lumion Knowledge Base — Sun Effect, Color Correction, Effects Categories
  (Lumion 12 list: Ray Tracing, Real Skies, God Rays, Volumetric Sunlight,
  Fog, Wind, Precipitation, 2-Point Perspective, Photo Matching…)
- Lumion realism settings guide — myarchitectai.com/blog/lumion-render-settings
  (Hyperlight 25–50%, effect stack order, over-processing warning)
- Corona tone-mapping/bloom/glare/LUT discussions — forums.chaos.com,
  vizacademyuk
- Enscape vs D5 comparison — d5render.com/enscape-compare, r/archviz
- Twinmotion ambience/lighting docs — dev.epicgames.com
- Archviz photography fundamentals — apalmanac.com (verticals, white
  balance, exposure), maverickframe.com (post-processing)
- Golden hour definition — en.wikipedia.org (sun ~5–12° elevation),
  photopills.com
