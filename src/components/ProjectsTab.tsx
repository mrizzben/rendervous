import { useEffect, useRef, useState } from 'react';
import type { Job, ModelInfo, ProjectDetail, ProjectSummary, Revision, Settings, Visualization } from '../api';
import {
  createProject, createVisualization, deleteRevision, generate, getJob, getProject,
  listProjects, pollUntil, restoreRevision, uploadDesign,
} from '../api';
import CompareView from './CompareView';
import RevisionTimeline from './RevisionTimeline';

interface ProjectsProps {
  model: ModelInfo | null;
  onError: (msg: string) => void;
  onJob: (j: Job) => void;
}

const LIGHTINGS = ['daylight', 'overcast', 'golden_hour', 'sunset', 'night'] as const;
const LIGHT_LABEL: Record<string, string> = {
  daylight: 'Daylight', overcast: 'Overcast', golden_hour: 'Golden hour', sunset: 'Sunset', night: 'Night',
};
const MATERIALS = ['original', 'concrete', 'wood', 'stone', 'custom'] as const;
const MAT_LABEL: Record<string, string> = { original: 'Original', concrete: 'Concrete', wood: 'Wood', stone: 'Stone', custom: 'Custom' };
const ENVS = ['none', 'tropical', 'urban', 'forest', 'custom'] as const;
const ENV_LABEL: Record<string, string> = { none: 'None', tropical: 'Tropical', urban: 'Urban', forest: 'Forest', custom: 'Custom' };

const DEFAULT_SETTINGS: Settings = {
  fidelity: 90,
  lighting: 'daylight',
  material: 'original',
  environment: 'none',
  custom_instruction: '',
};

export default function ProjectsTab({ model, onError, onJob }: ProjectsProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [newName, setNewName] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [vizStatus, setVizStatus] = useState<Record<number, string>>({});
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProjects().then(setProjects).catch((e) => onError(String(e)));
  }, []);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
    } else {
      getProject(selectedId).then(setDetail).catch((e) => onError(String(e)));
    }
  }, [selectedId]);

  const reload = async () => {
    if (selectedId != null) {
      const d = await getProject(selectedId);
      setDetail(d);
      return d;
    }
    return null;
  };

  const handleCreate = async () => {
    setErr('');
    try {
      const p = await createProject(newName.trim() || 'Untitled Project');
      setNewName('');
      setProjects((prev) => [...prev, p]);
      setSelectedId(p.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const handleUpload = async (file: File | null) => {
    if (!file || selectedId == null) return;
    setErr('');
    try {
      const isRef = (detail?.designs.length ?? 0) === 0;
      const d = await uploadDesign(selectedId, isRef ? 'Reference' : file.name, file);
      if (isRef) {
        // first design is the persistent source of truth per PLAN.md §13
        await getProject(selectedId).then(setDetail);
        // auto-create an initial visualization on the reference
        const viz = await createVisualization(d.id, 'Visualization', settings);
        setDetail((prev) => prev ? { ...prev, designs: prev.designs.map((dd) => dd.id === d.id ? { ...dd, visualizations: [...dd.visualizations, viz] } : dd) } : prev);
      } else {
        await reload();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const runGenerate = async (opts: { design: ProjectDetail['designs'][number]; vizId?: number; parentId?: number }) => {
    if (!model) {
      setErr('No model selected — pick one in the header first.');
      return;
    }
    setErr('');
    setBusy(true);
    let vizId = opts.vizId;
    try {
      if (!vizId) {
        const viz = await createVisualization(opts.design.id, 'Visualization', settings);
        vizId = viz.id;
        await reload();
      }
      setVizStatus((s) => ({ ...s, [vizId!]: 'running' }));
      const { job_id } = await generate({
        model: model.id,
        design_id: opts.design.id,
        visualization_id: vizId,
        parent_revision_id: opts.parentId,
        settings,
      });
      const out = await pollUntil(
        () => getJob(job_id),
        (j) => j.status === 'done' || j.status === 'failed',
        2000
      );
      onJob(out);
      if (out.status === 'failed') {
        setVizStatus((s) => ({ ...s, [vizId!]: `failed: ${out.error ?? 'unknown error'}` }));
        onError(out.error || 'Generation failed.');
      } else {
        setVizStatus((s) => ({ ...s, [vizId!]: 'done' }));
        await reload();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setVizStatus((s) => ({ ...s, [vizId ?? -1]: `failed: ${msg}` }));
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await restoreRevision(id);
      await reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBranch = async (parentId: number, vizId: number | undefined) => {
    if (!vizId) return;
    const vizzes = detail?.designs.flatMap((d) => d.visualizations) ?? [];
    const viz = vizzes.find((v) => v.id === vizId);
    const design = detail?.designs.find((d) => d.visualizations.some((v) => v.id === vizId));
    if (viz && design) {
      await runGenerate({ design, vizId: viz.id, parentId });
    }
  };

  const handleDelete = async (revId: number) => {
    const rev = detail?.designs
      .flatMap((d) => d.visualizations)
      .flatMap((v) => v.revisions)
      .find((r) => r.id === revId);
    if (!rev) return;
    if (!window.confirm(`Delete ${rev.label}?`)) return;
    setDeleting((prev) => new Set(prev).add(rev.id));
    try {
      await deleteRevision(rev.id);
      await reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting((prev) => {
        const n = new Set(prev);
        n.delete(rev.id);
        return n;
      });
    }
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const comparePair = (): [Revision, Revision] | null => {
    if (compareIds.length !== 2 || !detail) return null;
    const all = detail.designs.flatMap((d) => d.visualizations.flatMap((v) => v.revisions));
    const [a, b] = compareIds;
    const ra = all.find((r) => r.id === a);
    const rb = all.find((r) => r.id === b);
    return ra && rb ? [ra, rb] : null;
  };

  const selProject = projects.find((p) => p.id === selectedId);
  const compare = comparePair();

  return (
    <div className="projects-layout" style={{ padding: 16, alignItems: 'flex-start' }}>
      <div className="projects-side">
        <div className="panel">
          <h3>Projects</h3>
          <div className="flex">
            <input
              className="input"
              placeholder="New project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button className="btn-ghost" onClick={handleCreate}>＋</button>
          </div>
          <div style={{ marginTop: 8 }}>
            {projects.length === 0 && <div className="dim">No projects yet — create one.</div>}
            {projects.map((p) => (
              <button key={p.id} className={`proj-item ${p.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(p.id)}>
                {p.name}
                <small>{p.design_count} design{p.design_count === 1 ? '' : 's'} · {p.visualization_count} viz</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selProject && <div className="empty">Select a project (or create one) to start.</div>}

        {selProject && (
          <div className="panel">
            <h3>{selProject.name}</h3>
            {err && <div className="banner-error">{err}</div>}

            <label className="label">Designs (one per camera view — PLAN.md §13)</label>
            <div className="designs-row">
              {detail?.designs.map((d) => (
                <div key={d.id} className="design-card">
                  <div className="thumb">
                    {d.image_url ? <img src={d.image_url} alt={d.name} /> : <span className="noimg">no reference yet</span>}
                  </div>
                  <strong>{d.name}</strong>
                  <div className="actions">
                    <button className="btn-ghost" style={{ flex: 1 }} onClick={() => runGenerate({ design: d })} disabled={!model || busy}>
                      Generate
                    </button>
                  </div>
                </div>
              ))}
              <div className="design-card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
                  ⇧ Upload {detail && detail.designs.length === 0 ? 'reference' : 'design'}
                </button>
                <span className="dim" style={{ textAlign: 'center' }}>first upload is the immutable Reference</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleUpload(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </div>

            {/* settings card shared across the design's visualizations */}
            <div className="panel viz-card">
              <div className="flex" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Visualization</h3>
                <span className="dim">{model ? `model: ${model.name}` : 'pick a model in the header'}</span>
              </div>

              <label className="label">Geometry fidelity</label>
              <div className="fidelity">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.fidelity}
                  onChange={(e) => setSettings((s) => ({ ...s, fidelity: Number(e.target.value) }))}
                />
                <div className="scale"><span>STRICT {settings.fidelity} CREATIVE</span></div>
              </div>

              <div className="settings-grid">
                <div>
                  <label className="label">Lighting</label>
                  <div className="chips">
                    {LIGHTINGS.map((l) => (
                      <button key={l} className={`chip ${settings.lighting === l ? 'active' : ''}`} onClick={() => setSettings((s) => ({ ...s, lighting: l }))}>
                        {LIGHT_LABEL[l]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Materials</label>
                  <div className="chips">
                    {MATERIALS.map((m) => (
                      <button key={m} className={`chip ${settings.material === m ? 'active' : ''}`} onClick={() => setSettings((s) => ({ ...s, material: m }))}>
                        {MAT_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Environment</label>
                  <div className="chips">
                    {ENVS.map((e) => (
                      <button key={e} className={`chip ${settings.environment === e ? 'active' : ''}`} onClick={() => setSettings((s) => ({ ...s, environment: e }))}>
                        {ENV_LABEL[e]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="label">Custom instruction <span className="dim">(natural-language revision — PLAN.md §11)</span></label>
              <textarea
                className="input"
                style={{ minHeight: 48 }}
                placeholder="e.g. Make the facade exposed concrete."
                value={settings.custom_instruction ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, custom_instruction: e.target.value }))}
              />
            </div>

            {/* revisions per visualization */}
            {detail?.designs.flatMap((d) => d.visualizations).map((viz: Visualization) => {
              const status = vizStatus[viz.id];
              return (
                <div key={viz.id} className="panel viz-card">
                  <h3>{viz.name} <span className="dim" style={{ fontWeight: 400 }}>#{viz.id}</span></h3>
                  {status === 'running' && (
                    <div className="jobline"><span className="spinner" /> Generating on OpenRouter…</div>
                  )}
                  {status && status.startsWith('failed') && <div className="banner-error">{status}</div>}
                  <RevisionTimeline
                    revisions={viz.revisions}
                    currentId={viz.current_revision_id}
                    compare={compareIds}
                    onCompare={toggleCompare}
                    onRestore={handleRestore}
                    onBranch={(rid) => handleBranch(rid, viz.id)}
                    onDelete={handleDelete}
                    deleting={deleting}
                    busy={busy}
                  />
                </div>
              );
            })}

            {compare && (
              <div className="panel viz-card">
                <div className="flex" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>Compare</h3>
                  <button className="btn-ghost" onClick={() => setCompareIds([])}>✕ Close</button>
                </div>
                {(() => {
                  const vizOf = (rid: number) =>
                    detail?.designs.flatMap((d) => d.visualizations).find((v) => v.revisions.some((r) => r.id === rid));
                  const curViz = vizOf(compare[0].id) ?? vizOf(compare[1].id);
                  return (
                    <CompareView a={compare[0]} b={compare[1]} currentId={curViz?.current_revision_id ?? null} />
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}