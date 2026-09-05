import type { ReactNode } from "react";
import type { Settings } from "../api";
import type { Preset } from "../options";
import {
  DEFAULT_SETTINGS,
  ENVIRONMENTS,
  F_STOPS,
  FOCAL_LENGTHS,
  GRADE_INTENSITY_MAX,
  GRADE_INTENSITY_MIN,
  LAMP_TEMP_MAX,
  LAMP_TEMP_MIN,
  LIGHTINGS,
  MATERIALS,
  FINISHES,
  SKIES,
  SATURATION_MAX,
  SATURATION_MIN,
  STYLES,
  SEASONS,
  SUN_DIRECTIONS,
  SUN_ELEVATION_MAX,
  SUN_ELEVATION_MIN,
  SUN_PRESET_IDS,
  WEATHERS,
} from "../options";

interface VisualizePanelProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  busy: boolean;
  disabled: boolean;
  engineName: string;
  onRender: () => void;
  elapsed: number;
  presets: Preset[];
  onSavePreset: () => void;
  onApplyPreset: (p: Preset) => void;
  onDeletePreset: (name: string) => void;
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ctl">
      <div className="ctl-label">{label}</div>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`chip ${value === o.id ? "active" : ""}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AutoChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="ctl">
      <div className="ctl-label">
        {label}
        <span className="fid-val">{value ?? "auto"}</span>
      </div>
      <div className="chips">
        <button
          type="button"
          className={`chip ${value ? "" : "active"}`}
          onClick={() => onChange(undefined)}
        >
          Auto
        </button>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`chip ${value === o.id ? "active" : ""}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  display,
  min,
  max,
  step,
  disabled,
  scale,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  scale: [string, string];
  onChange: (v: number) => void;
}) {
  return (
    <div className="ctl">
      <div className="ctl-label">
        {label}
        <span className="fid-val">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
      <div className="fid-scale">
        <span>{scale[0]}</span>
        <span>{scale[1]}</span>
      </div>
    </div>
  );
}

// Collapsible group with a summary of the values customized inside it, so
// users can see at a glance whether a collapsed section holds a non-default
// setting. Empty `summary` means everything inside is at its default.
function ConfigGroup({
  title,
  summary,
  children,
  open,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="adv" open={open}>
      <summary>
        {title}
        {summary && <span className="adv-val">{summary}</span>}
      </summary>
      <div className="adv-body">{children}</div>
    </details>
  );
}

const labelOf = <T extends string>(
  options: readonly { id: T; label: string }[],
  id: T | undefined,
) => options.find((o) => o.id === id)?.label;

export default function VisualizePanel({
  settings,
  onChange,
  busy,
  disabled,
  engineName,
  onRender,
  elapsed,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: VisualizePanelProps) {
  const hasSun = SUN_PRESET_IDS.includes(
    settings.lighting as (typeof SUN_PRESET_IDS)[number],
  );
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const sceneSummary = [
    settings.material === DEFAULT_SETTINGS.material
      ? null
      : labelOf(MATERIALS, settings.material),
    settings.finish ? labelOf(FINISHES, settings.finish) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const envSummary = [
    settings.sky ? labelOf(SKIES, settings.sky) : null,
    settings.environment === DEFAULT_SETTINGS.environment
      ? null
      : labelOf(ENVIRONMENTS, settings.environment),
    settings.season ? labelOf(SEASONS, settings.season) : null,
    settings.weather ? labelOf(WEATHERS, settings.weather) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <aside className="controls">
      <div className="ctl-head">
        <span className="rail-title">Visualize</span>
        <span className="dim">model · {engineName}</span>
      </div>

      {/* Key configs — always visible */}
      <ChipGroup
        label="Style"
        options={STYLES}
        value={settings.style}
        onChange={(v) => onChange({ ...settings, style: v })}
      />
      <ChipGroup
        label="Lighting"
        options={LIGHTINGS}
        value={settings.lighting}
        onChange={(v) => onChange({ ...settings, lighting: v })}
      />

      <RangeControl
        label="Lamp temperature"
        display={`${settings.lamp_temp ?? 3000}K`}
        min={LAMP_TEMP_MIN}
        max={LAMP_TEMP_MAX}
        step={100}
        value={settings.lamp_temp ?? 3000}
        disabled={
          settings.lighting !== "night" && settings.lighting !== "sunset"
        }
        scale={["WARM WHITE ~2700K", "DAYLIGHT ~6000K"]}
        onChange={(v) => set({ lamp_temp: v })}
      />

      <RangeControl
        label="Geometry fidelity"
        display={
          settings.fidelity >= 80
            ? "strict"
            : settings.fidelity >= 41
              ? "balanced"
              : "creative"
        }
        min={0}
        max={100}
        value={settings.fidelity}
        scale={["CREATIVE", "STRICT"]}
        onChange={(v) => set({ fidelity: v })}
      />

      <ConfigGroup title="Scene & materials" summary={sceneSummary}>
        <AutoChipGroup
          label="Materials"
          options={MATERIALS}
          value={settings.material}
          onChange={(v) => set({ material: v })}
        />
        <AutoChipGroup
          label="Finish"
          options={FINISHES}
          value={settings.finish}
          onChange={(v) => set({ finish: v })}
        />
      </ConfigGroup>

      <ConfigGroup title="Environment & atmosphere" summary={envSummary}>
        <AutoChipGroup
          label="Sky"
          options={SKIES}
          value={settings.sky}
          onChange={(v) => set({ sky: v })}
        />
        <AutoChipGroup
          label="Environment"
          options={ENVIRONMENTS}
          value={settings.environment}
          onChange={(v) => set({ environment: v })}
        />
        <AutoChipGroup
          label="Season"
          options={SEASONS}
          value={settings.season}
          onChange={(v) => set({ season: v })}
        />
        <AutoChipGroup
          label="Weather"
          options={WEATHERS}
          value={settings.weather}
          onChange={(v) => set({ weather: v })}
        />
      </ConfigGroup>

      <ConfigGroup title="Camera & grade">
        <AutoChipGroup
          label="Sun direction"
          options={SUN_DIRECTIONS}
          value={settings.sun_direction}
          onChange={(v) => set({ sun_direction: v })}
        />
        <RangeControl
          label="Sun elevation"
          display={
            settings.sun_elevation == null
              ? "auto"
              : `${settings.sun_elevation}°`
          }
          min={SUN_ELEVATION_MIN}
          max={SUN_ELEVATION_MAX}
          step={1}
          value={settings.sun_elevation ?? 45}
          disabled={!hasSun}
          scale={["HORIZON 0°", "NOON 90°"]}
          onChange={(v) => set({ sun_elevation: v })}
        />
        <AutoChipGroup
          label="Focal length"
          options={FOCAL_LENGTHS.map((mm) => ({
            id: String(mm),
            label: `${mm}mm`,
          }))}
          value={
            settings.focal_length == null
              ? undefined
              : String(settings.focal_length)
          }
          onChange={(v) =>
            set({ focal_length: v == null ? undefined : Number(v) })
          }
        />
        <RangeControl
          label="Grade intensity"
          display={
            settings.grade_intensity == null
              ? "auto"
              : String(settings.grade_intensity)
          }
          min={GRADE_INTENSITY_MIN}
          max={GRADE_INTENSITY_MAX}
          step={1}
          value={settings.grade_intensity ?? 50}
          scale={["SUBTLE", "CINEMATIC"]}
          onChange={(v) => set({ grade_intensity: v })}
        />
        <AutoChipGroup
          label="Aperture"
          options={F_STOPS.map((f) => ({ id: String(f), label: `f/${f}` }))}
          value={settings.f_stop == null ? undefined : String(settings.f_stop)}
          onChange={(v) => set({ f_stop: v == null ? undefined : Number(v) })}
        />
        <RangeControl
          label="Saturation"
          display={
            settings.saturation == null ? "auto" : String(settings.saturation)
          }
          min={SATURATION_MIN}
          max={SATURATION_MAX}
          step={1}
          value={settings.saturation ?? 50}
          scale={["MUTED", "VIVID"]}
          onChange={(v) => set({ saturation: v })}
        />
      </ConfigGroup>

      {/* Saved presets: one click restores a stored model + config combo */}
      <div className="ctl">
        <div className="ctl-label">Presets</div>
        <div className="chips">
          <button
            type="button"
            className="chip preset-save"
            onClick={onSavePreset}
            disabled={busy}
          >
            + Save
          </button>
          {presets.map((p) => (
            <span key={p.name} className="chip preset-chip">
              <button
                type="button"
                className="preset-apply"
                onClick={() => onApplyPreset(p)}
              >
                {p.name}
              </button>
              <button
                type="button"
                className="preset-del"
                aria-label={`Delete preset ${p.name}`}
                onClick={() => onDeletePreset(p.name)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="reset-btn"
        onClick={() => onChange(DEFAULT_SETTINGS)}
      >
        Reset all configs to default
      </button>

      {/* Sticky footer: prompt + Render always visible, no scrolling */}
      <div className="render-footer">
        <div className="ctl">
          <div className="ctl-label">
            What should change? <span className="dim">(optional)</span>
          </div>
          <textarea
            className="inp detail-inp"
            placeholder="e.g. Make the facade exposed concrete · dark teak floor · overcast sky"
            value={settings.custom_instruction ?? ""}
            onChange={(e) =>
              onChange({ ...settings, custom_instruction: e.target.value })
            }
          />
        </div>

        <button
          className="btn-render"
          onClick={onRender}
          disabled={busy || disabled}
        >
          {busy ? (
            <>
              <span className="spinner" /> Rendering… {elapsed}s
            </>
          ) : disabled ? (
            "Import a design to render"
          ) : (
            <>
              Render{" "}
              {settings.lighting === "golden_hour"
                ? "golden hour"
                : settings.style === "photoreal"
                  ? "photoreal"
                  : settings.style}
            </>
          )}
        </button>
        <div className="dim ctl-note">
          Renders preserve the imported geometry — only materials, light,
          environment and atmosphere change.
        </div>
      </div>
    </aside>
  );
}
