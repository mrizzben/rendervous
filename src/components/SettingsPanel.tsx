import type { ModelInfo } from '../api';
import { shortModel } from '../api';

interface SettingsPanelProps {
  model: ModelInfo | null;
  mode: 'txt' | 'img';
  width: number;
  height: number;
  steps: number;
  cfg: number;
  denoise: number;
  seed: number | null;
  onWidth: (v: number) => void;
  onHeight: (v: number) => void;
  onSteps: (v: number) => void;
  onCfg: (v: number) => void;
  onDenoise: (v: number) => void;
  onSeed: (v: number) => void;
}

const SIZES: [number, number][] = [
  [512, 512],
  [512, 768],
  [768, 512],
  [640, 640],
  [768, 768],
  [1024, 1024],
];

export default function SettingsPanel(p: SettingsPanelProps) {
  const sizeKey = `${p.width}x${p.height}`;
  const same = SIZES.some(([w, h]) => w === p.width && h === p.height);

  return (
    <div className="panel">
      <h3>Settings</h3>

      <label className="label">Size</label>
      <select
        className="input"
        value={sizeKey}
        onChange={(e) => {
          const [w, h] = e.target.value.split('x').map(Number);
          p.onWidth(w);
          p.onHeight(h);
        }}
      >
        {SIZES.map(([w, h]) => (
          <option key={`${w}x${h}`} value={`${w}x${h}`}>
            {w} × {h}
          </option>
        ))}
      </select>
      {!same && (
        <div className="dim">custom {p.width}×{p.height}</div>
      )}

      <label className="label">Steps</label>
      <input
        className="input"
        type="number"
        min={1}
        max={200}
        value={p.steps}
        onChange={(e) => p.onSteps(Number(e.target.value) || 1)}
      />

      <label className="label">CFG scale</label>
      <input
        className="input"
        type="number"
        min={1}
        max={30}
        step={0.5}
        value={p.cfg}
        onChange={(e) => p.onCfg(Number(e.target.value) || 1)}
      />

      {p.mode === 'img' && (
        <>
          <label className="label">Denoising strength {p.denoise.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.denoise}
            onChange={(e) => p.onDenoise(Number(e.target.value))}
          />
          <div className="dim">How much freedom the model has vs. the reference</div>
        </>
      )}

      <label className="label">Seed</label>
      <div className="seedline">
        <input
          className="input"
          type="text"
          inputMode="numeric"
          placeholder="random"
          value={p.seed ?? ''}
          onChange={(e) => p.onSeed(e.target.value === '' ? -1 : Number(e.target.value))}
        />
        <button
          className="dice-btn"
          title="Random seed"
          onClick={() => p.onSeed(-1)}
        >
          🎲
        </button>
      </div>
      {p.seed === -1 && <div className="dim">random per generation</div>}

      <label className="label">Sampler</label>
      <input
        className="input"
        style={{ opacity: 0.75 }}
        value={`OpenRouter · ${p.model ? shortModel(p.model.id) : '…'}`}
        disabled
        title="The OpenRouter image model acts as the sampler."
      />
    </div>
  );
}