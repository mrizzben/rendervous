// Architectural visualization presets (PLAN.md §10, UI.md).
// Ordered as they appear in the Visualize panel.

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
