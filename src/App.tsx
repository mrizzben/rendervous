import { useEffect, useMemo, useState } from 'react';
import type { Job, ModelInfo } from './api';
import { fmtPrice, getHealth, getModels, hasUserKey, saveKey, shortModel } from './api';
import Tabs, { type TabId } from './components/Tabs';
import GeneratorPanel from './components/GeneratorPanel';
import ProjectsTab from './components/ProjectsTab';
import HistoryTab from './components/HistoryTab';

const RECOMMENDED_ID = 'google/gemini-2.5-flash-image';

export default function App() {
  const [tab, setTab] = useState<TabId>('txt2img');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState<string>(RECOMMENDED_ID);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('rendervous_api_key') ?? '');
  const [serverKey, setServerKey] = useState(false);
  const [jobs, setJobs] = useState<Record<number, Job>>({});
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [banner, setBanner] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);

  // sorted: recommended first, then by image_price asc, then id
  const sortedModels = useMemo(() => {
    const price = (m: ModelInfo) => (typeof m.image_price === 'number' ? m.image_price : Number.MAX_SAFE_INTEGER);
    return [...models].sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      const pd = price(a) - price(b);
      if (pd !== 0) return pd;
      return a.id.localeCompare(b.id);
    });
  }, [models]);

  const model = useMemo(() => models.find((m) => m.id === modelId) ?? null, [models, modelId]);
  const anyRunning = Object.values(jobs).some((j) => j.status === 'running' || j.status === 'queued');

  useEffect(() => {
    getHealth().then((h) => setServerKey(!!h.key_configured)).catch(() => setServerKey(false));
    loadModels(true);
  }, []);

  useEffect(() => {
    setBanner('');
  }, [apiKey, serverKey]);

  const shownBanner = banner || (!hasUserKey() && !serverKey
    ? 'No API key configured — paste yours in the header bar or set OPENROUTER_API_KEY on the server.'
    : '');

  const loadModels = async (force = false) => {
    setModelsLoading(true);
    try {
      setModels(await getModels(force));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setModelsLoading(false);
    }
  };

  const onKeyChange = (v: string) => {
    setApiKey(v);
    saveKey(v);
  };

  const handleJob = (j: Job) => setJobs((prev) => ({ ...prev, [j.id]: j }));
  const handleError = (msg: string) => setBanner(msg);

  const jobList = Object.values(jobs);

  return (
    <>
      <header className="header">
        <div className="brand">
          <h1>Renderv<em>ou</em>s</h1>
          <small>OpenRouter · Stable Diffusion WebUI-style</small>
        </div>

        <div className="grow" />

        <div className="keybox" title={hasUserKey() ? 'Your OpenRouter key (stored in this browser)' : 'Set your OpenRouter API key to generate'}>
          <span className={`keydot ${hasUserKey() ? 'ok' : 'missing'}`} />
          <input
            type="password"
            placeholder="OpenRouter API key"
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
          />
        </div>

        <div className="modelbox">
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={modelsLoading}>
            {models.length === 0 && <option value="">loading models…</option>}
            {sortedModels.map((m) => (
              <option key={m.id} value={m.id}>
                {shortModel(m.id)} — {fmtPrice(m.image_price)} {m.recommended ? '(recommended)' : ''}
              </option>
            ))}
          </select>
          <button className="btn-ghost" title="Refresh model list" onClick={() => loadModels(true)} disabled={modelsLoading}>
            ↻
          </button>
        </div>
      </header>

      <Tabs active={tab} onChange={setTab} busy={anyRunning} />

      {shownBanner && <div className="banner-error" style={{ margin: 12 }}>{shownBanner}</div>}

      {tab === 'txt2img' && <GeneratorPanel key="txt" mode="txt" model={model} jobs={jobList} onJob={handleJob} onError={handleError} />}
      {tab === 'img2img' && <GeneratorPanel key="img" mode="img" model={model} jobs={jobList} onJob={handleJob} onError={handleError} />}
      {tab === 'projects' && <ProjectsTab model={model} onError={handleError} onJob={handleJob} />}
      {tab === 'history' && <HistoryTab refreshNonce={refreshNonce} jobs={jobList} onRefresh={() => setRefreshNonce((n) => n + 1)} />}
    </>
  );
}