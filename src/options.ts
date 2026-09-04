// Architectural visualization presets (PLAN.md §10, UI.md).
// Ordered as they appear in the Visualize panel.

import type { Settings } from "./api";

// The initial state of the Visualize panel and the target of its reset button.
export const DEFAULT_SETTINGS: Settings = {
  fidelity: 90,
  style: "photoreal",
  lighting: "daylight",
  material: "original",
  environment: "none",
  lamp_temp: 3000, // Kelvin, warm white – daylight
  custom_instruction: "",
};

export const STYLES = [
  { id: "photoreal", label: "Photoreal" },
  { id: "editorial", label: "Editorial" },
  { id: "minimal", label: "Minimal" },
  { id: "atmospheric", label: "Atmospheric" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

export const LIGHTINGS = [
  { id: "daylight", label: "Daylight" },
  { id: "overcast", label: "Overcast" },
  { id: "golden_hour", label: "Golden hour" },
  { id: "sunset", label: "Sunset" },
  { id: "night", label: "Night" },
] as const;

// Temperature of non-natural light sources (lamps, lightbulbs), in Kelvin.
export const LAMP_TEMP_MIN = 2700; // warm white
export const LAMP_TEMP_MAX = 6000; // daylight

// --- Advanced configs (override presets when set; undefined = auto) --------

// Direction of sunlight relative to the camera. `undefined` = let the
// lighting preset decide.
export const SUN_DIRECTIONS = [
  { id: "front", label: "Front" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "behind", label: "Behind" },
] as const;

export type SunDirectionId = (typeof SUN_DIRECTIONS)[number]["id"];

// Sun height above the horizon in degrees. Full physical range: 0° = on the
// horizon (sunset/sunrise), 90° = directly overhead (tropical noon).
// Golden hour sits at 5–12°; usable daylight 30–60°.
export const SUN_ELEVATION_MIN = 0;
export const SUN_ELEVATION_MAX = 90;

// Lighting presets with a visible sun; elevation/direction don't apply to
// overcast (sun behind clouds) or night (below horizon).
export const SUN_PRESET_IDS = ["daylight", "golden_hour", "sunset"] as const;

// Common architecture-photography focal lengths (mm). 17–24mm = tilt-shift
// territory for interiors/wide exteriors, 35mm general, 50mm natural
// perspective, 85mm details.
export const FOCAL_LENGTHS = [16, 24, 35, 50, 85] as const;

// F-stops. f/8–f/11 is the sharpness sweet spot for archviz; f/2.8–f/4 for
// shallow depth of field; f/16 the deepest focus before diffraction.
export const F_STOPS = [2.8, 4, 5.6, 8, 11, 16] as const;

export const MATERIALS = [
  { id: "original", label: "As designed" },
  { id: "concrete", label: "Concrete" },
  { id: "wood", label: "Wood" },
  { id: "stone", label: "Stone" },
  { id: "custom", label: "Custom" },
] as const;

export const ENVIRONMENTS = [
  { id: "none", label: "None" },
  { id: "tropical", label: "Tropical" },
  { id: "urban", label: "Urban" },
  { id: "forest", label: "Forest" },
  { id: "custom", label: "Custom" },
] as const;

// --- P1 features (each branch fills ONLY its own marker) -------------------

export const SEASONS = [
  { id: "summer", label: "Summer" },
  { id: "autumn", label: "Autumn" },
  { id: "winter", label: "Winter" },
  { id: "spring", label: "Spring" },
] as const;

export const WEATHERS = [
  { id: "clear", label: "Clear" },
  { id: "overcast", label: "Overcast" },
  { id: "fog", label: "Fog" },
  { id: "rain", label: "Rain" },
  { id: "snow", label: "Snow" },
] as const;

export const FINISHES = [
  { id: "matte", label: "Matte" },
  { id: "polished", label: "Polished" },
  { id: "weathered", label: "Weathered" },
] as const;

// Sky presets (Sun & Sky). The sky drives the light: describing it lets the
// model re-light the scene to match (Lumion Real Skies approach).
export const SKIES = [
  { id: "clear_blue", label: "Clear blue" },
  { id: "scattered_clouds", label: "Scattered clouds" },
  { id: "overcast_dramatic", label: "Dramatic overcast" },
  { id: "hazy", label: "Hazy" },
] as const;

// >>> grade-intensity: GRADE_INTENSITY_MIN/MAX consts here <<<

// >>> saturation: SATURATION_MIN/MAX consts here <<<
