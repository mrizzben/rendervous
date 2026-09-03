import { useState } from 'react';
import type { Job, ModelInfo } from '../api';
import { generate, getJob, pollUntil } from '../api';
import Gallery from './Gallery';
import ImageUpload from './ImageUpload';
import SettingsPanel from './SettingsPanel';

interface GenProps {
  mode: 'txt' | 'img';
  model: ModelInfo | null;
  jobs: Job[];
  onJob: (j: Job) => void;
  onError: (msg: string) => void;
}

export default function GeneratorPanel({ mode, model, jobs, onJob, onError }: GenProps) {
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [steps, setSteps] = useState(40);
  const [cfg, setCfg] = useState(7);
  const [denoise, setDenoise] = useState(0.6);
  const [seed, setSeed] = useState<number | null>(-1);
  const [image, setImage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');

  const timed = async <T,>(fn: () => Promise<T>) => {
    // simple stopwatch in button label
    setElapsed(0);
    const started = Date.now();
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      return await fn();
    } finally {
      clearInterval(iv);
    }
  };

  const generateIt = async () => {
    setErr('');
    if (mode === 'txt' && !prompt.trim()) {
      setErr('Enter a prompt first.');
      return;
    }
    if (mode === 'img' && !image) {
      setErr('Upload a reference image for img2img.');
      return;
    }
    if (!model) {
      setErr('No model available — click the refresh button in the header.');
      return;
    }

    setRunning(true);
    try {
      const { job_id } = await timed(() =>
        generate({
          model: model.id,
          prompt: mode === 'txt' ? prompt : `${prompt}`.trim() || undefined,
          negative_prompt: negative || undefined,
          width,
          height,
          steps,
          cfg,
          denoise: mode === 'img' ? denoise : undefined,
          seed: seed && seed >= 0 ? seed : undefined,
          image_url: mode === 'img' ? (image ?? undefined) : undefined,
        })
      );

      await timed(async () => {
        const out = await pollUntil(
          async () => {
            const j = await getJob(job_id);
            onJob(j);
            return j;
          },
          (j) => j.status === 'done' || j.status === 'failed',
          2000
        );
        if (out.status === 'failed') {
          setErr(out.error || 'Generation failed.');
          onError(out.error || 'Generation failed.');
        }
        return out;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      onError(msg);
    } finally {
      setRunning(false);
      setElapsed(0);
    }
  };

  return (
    <div className="app-body">
      <div className="main-col">
        <div className="panel">
          <label className="label">Prompt</label>
          <textarea
            className="input prompt-box"
            placeholder="a serene courtyard villa at golden hour, architectural photography, 35mm"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <label className="label">Negative prompt <span className="dim">(or leave empty)</span></label>
          <textarea
            className="input neg-box"
            placeholder="lowres, blurry, distorted, extra floors, wrong window count"
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
          />
          <button className="btn-gen" onClick={generateIt} disabled={running || !model || (mode === 'img' && !image)}>
            {running ? (
              <>
                <span className="spinner" />
                Generating… {elapsed}s
              </>
            ) : (
              <>Generate</>
            )}
          </button>
          {err && <div className="banner-error mt">{err}</div>}
        </div>

        <div className="panel">
          <h3>Gallery</h3>
          <Gallery jobs={jobs} />
        </div>
      </div>

      <div className="side-col">
        {mode === 'img' && (
          <div className="panel">
            <h3>Reference</h3>
            <ImageUpload value={image} onChange={setImage} label="img2img · the design is the source of truth" />
          </div>
        )}
        <SettingsPanel
          model={model}
          mode={mode}
          width={width}
          height={height}
          steps={steps}
          cfg={cfg}
          denoise={denoise}
          seed={seed}
          onWidth={setWidth}
          onHeight={setHeight}
          onSteps={setSteps}
          onCfg={setCfg}
          onDenoise={setDenoise}
          onSeed={setSeed}
        />
      </div>
    </div>
  );
}