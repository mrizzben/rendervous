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
**Open** on first launch. Some macOS configurations may still refuse unsigned
apps.

## Data and rendering

Desktop projects, revisions, and images are stored on your computer. Rendering
sends the selected reference image and settings to OpenRouter using your key.
Your key stays in the local app profile and is not saved by the app server.

## For developers

See [DEVELOPING.md](DEVELOPING.md) for source setup, Docker, API details, and
desktop packaging.
