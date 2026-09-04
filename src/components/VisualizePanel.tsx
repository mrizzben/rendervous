import type { Settings } from "../api";
import {
  ENVIRONMENTS,
  LAMP_TEMP_MAX,
  LAMP_TEMP_MIN,
  LIGHTINGS,
  MATERIALS,
  STYLES,
} from "../options";

interface VisualizePanelProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  busy: boolean;
  disabled: boolean;
  engineName: string;
  onRender: () => void;
  elapsed: number;
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

export default function VisualizePanel({
  settings,
  onChange,
  busy,
  disabled,
  engineName,
  onRender,
  elapsed,
}: VisualizePanelProps) {
  return (
    <aside className="controls">
      <div className="ctl-head">
        <span className="rail-title">Visualize</span>
        <span className="dim">model · {engineName}</span>
      </div>

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
      <ChipGroup
        label="Materials"
        options={MATERIALS}
        value={settings.material}
        onChange={(v) => onChange({ ...settings, material: v })}
      />
      <ChipGroup
        label="Environment"
        options={ENVIRONMENTS}
        value={settings.environment}
        onChange={(v) => onChange({ ...settings, environment: v })}
      />

      <div className="ctl">
        <div className="ctl-label">
          Geometry fidelity
          <span className="fid-val">
            {settings.fidelity >= 80
              ? "strict"
              : settings.fidelity >= 41
                ? "balanced"
                : "creative"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={settings.fidelity}
          onChange={(e) =>
            onChange({ ...settings, fidelity: Number(e.target.value) })
          }
          disabled={busy}
        />
        <div className="fid-scale">
          <span>CREATIVE</span>
          <span>STRICT</span>
        </div>
      </div>

      <div className="ctl">
        <div className="ctl-label">
          Lamp temperature
          <span className="fid-val">{settings.lamp_temp ?? 3000}K</span>
        </div>
        <input
          type="range"
          min={LAMP_TEMP_MIN}
          max={LAMP_TEMP_MAX}
          step={100}
          value={settings.lamp_temp ?? 3000}
          onChange={(e) =>
            onChange({ ...settings, lamp_temp: Number(e.target.value) })
          }
          disabled={
            busy ||
            (settings.lighting !== "night" && settings.lighting !== "sunset")
          }
        />
        <div className="fid-scale">
          <span>WARM WHITE ~2700K</span>
          <span>DAYLIGHT ~6000K</span>
        </div>
      </div>

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
    </aside>
  );
}
