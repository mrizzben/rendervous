import type { EditOps } from "../lib/imageEdit";
import { isDirty } from "../lib/imageEdit";

/** Right-column tool panel in Edit mode. Stateless over `ops` — the live
 *  preview lives on the stage (CanvasStage); Apply triggers a full-res bake
 *  upstream (App) which stores the result as a new minor revision. */
interface EditPanelProps {
  ops: EditOps;
  disabled: boolean; // no current render to edit
  busy: boolean;
  regionTool: boolean; // AI region-select tool active on the stage
  onChange: (patch: Partial<EditOps>) => void;
  onReset: () => void;
  onHoldOriginal: (hold: boolean) => void;
  onToggleRegion: () => void;
  onApply: () => void;
}

type NumKey =
  | "straighten"
  | "exposure"
  | "contrast"
  | "temperature"
  | "saturation"
  | "sharpen"
  | "vignette";

const SET = (id: NumKey, label: string, min: number, max: number) => ({
  id,
  label,
  min,
  max,
});
const SLIDERS = [
  SET("straighten", "Straighten", -10, 10),
  SET("exposure", "Exposure", -100, 100),
  SET("contrast", "Contrast", -100, 100),
  SET("temperature", "Temperature", -100, 100),
  SET("saturation", "Saturation", -100, 100),
  SET("sharpen", "Sharpen", 0, 100),
  SET("vignette", "Vignette", 0, 100),
] as const;

const ROTATE_DIRS: { id: 90 | 270; label: string; title: string }[] = [
  { id: 270, label: "⟲", title: "Rotate 90° left" },
  { id: 90, label: "⟳", title: "Rotate 90° right" },
];

export default function EditPanel({
  ops,
  disabled,
  busy,
  regionTool,
  onChange,
  onReset,
  onHoldOriginal,
  onToggleRegion,
  onApply,
}: EditPanelProps) {
  const dirty = isDirty(ops);
  const off = disabled || busy;

  const disp = (id: NumKey): string => {
    const v = ops[id];
    if (id === "temperature" && v !== 0)
      return v > 0 ? `warm ${v}` : `cool ${-v}`;
    return id === "straighten" ? `${v}°` : String(v);
  };

  return (
    <aside className="controls edit-panel">
      <div className="ctl-head">
        <span className="rail-title">Edit</span>
        <span className="dim">model-free · instant</span>
      </div>

      {disabled ? (
        <div className="dim">
          Render first — the Edit tools work on the rendered result.
        </div>
      ) : (
        <div className="dim ctl-note">
          The preview on the stage follows these tools live.
        </div>
      )}

      {/* geometry buttons */}
      <div className="ctl">
        <div className="ctl-label">Geometry</div>
        <div className="chips">
          {ROTATE_DIRS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="chip"
              disabled={off}
              title={r.title}
              onClick={() => {
                const next = (ops.rotate + r.id) % 360;
                const rot = (next === 90 ? 90 : next === 180 ? 180 : next === 270 ? 270 : 0) as 0 | 90 | 180 | 270;
                onChange({ rotate: rot });
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${ops.flipH ? "active" : ""}`}
            disabled={off}
            onClick={() => onChange({ flipH: !ops.flipH })}
          >
            Flip H
          </button>
          <button
            type="button"
            className={`chip ${ops.flipV ? "active" : ""}`}
            disabled={off}
            onClick={() => onChange({ flipV: !ops.flipV })}
          >
            Flip V
          </button>
        </div>
      </div>

      {/* model-flow tools: region edit via the engine */}
      <div className="ctl">
        <div className="ctl-label">Region edit · AI</div>
        <div className="chips">
          <button
            type="button"
            className={`chip ${regionTool ? "active" : ""}`}
            disabled={off}
            onClick={onToggleRegion}
            title="Change one area with the engine — everything outside stays untouched"
          >
            Select area
          </button>
        </div>
        {regionTool && (
          <div className="dim ctl-note">
            Drag a box on the stage, describe the change, press Apply edit —
            the engine changes only that area.
          </div>
        )}
      </div>

      {SLIDERS.map((s) => (
        <div className="ctl" key={s.id}>
          <div className="ctl-label">
            {s.label}
            <span className="fid-val">{disp(s.id)}</span>
          </div>
          <input
            type="range"
            min={s.min}
            max={s.max}
            value={ops[s.id]}
            disabled={off}
            onChange={(e) => onChange({ [s.id]: Number(e.target.value) })}
          />
        </div>
      ))}

      <div className="render-footer">
        <div className="edit-footer-row">
          <button
            type="button"
            className="btn-edit-cancel"
            disabled={!dirty || off}
            onPointerDown={() => onHoldOriginal(true)}
            onPointerUp={() => onHoldOriginal(false)}
            onPointerLeave={() => onHoldOriginal(false)}
            title="Hold to preview the original render on the stage"
          >
            Hold&nbsp;original
          </button>
          <button
            type="button"
            className="btn-edit-reset"
            disabled={!dirty || off}
            onClick={onReset}
          >
            Reset
          </button>
        </div>
        <button
          type="button"
          className="btn-edit-apply"
          disabled={!dirty || off}
          onClick={onApply}
        >
          {busy ? "Saving…" : "Apply edit"}
        </button>
        <div className="dim ctl-note">
          Applies to the current render and is stored as the next minor version
          (v2 → v2.1) — instant, no engine cost.
        </div>
      </div>
    </aside>
  );
}
