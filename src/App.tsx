import { useEffect, useMemo, useReducer, useState } from "react";
import type {
  Design,
  EditSpec,
  ModelInfo,
  ProjectSummary,
  Revision,
  Settings,
  AspectRatio,
} from "./api";
import {
  createProject,
  createVisualization,
  deleteDesign,
  deleteProject,
  deleteRevision,
  generate,
  getHealth,
  getJob,
  getModels,
  getProject,
  hasUserKey,
  imageUrlToDataUrl,
  listProjects,
  measureImage,
  pollUntil,
  restoreRevision,
  renameProject,
  setDesignArchived,
  setProjectArchived,
  shortModel,
  saveEdit,
  uploadDesign,
} from "./api";
import CanvasStage from "./components/CanvasStage";
import CompareView from "./components/CompareView";
import Filmstrip from "./components/Filmstrip";
import Header from "./components/Header";
import LeftRail from "./components/LeftRail";
import Modal from "./components/Modal";
import VisualizePanel from "./components/VisualizePanel";
import EditPanel from "./components/EditPanel";
import { bakeEdit, DEFAULT_OPS, type EditOps } from "./lib/imageEdit";
import PromptPanel from "./components/PromptPanel";
import {
  DEFAULT_SETTINGS,
  loadPresets,
  savePresets,
  type Preset,
} from "./options";

const RECOMMENDED_ID = "google/gemini-3.1-flash-image";

export default function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState<string>(RECOMMENDED_ID);
  const [serverKey, setServerKey] = useState(false);
  const [banner, setBanner] = useState("");

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [designId, setDesignId] = useState<number | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [designRatio, setDesignRatio] = useState<AspectRatio | "auto" | null>(
    null,
  );
  const [stageTab, setStageTab] = useState<"render" | "edit">("render");
  const [editOps, setEditOps] = useState<EditOps>(DEFAULT_OPS);
  const [showOriginal, setShowOriginal] = useState(false);
  const [regionTool, setRegionTool] = useState(false); // AI region-select tool
  const [shapeTool, setShapeTool] = useState<"rect" | "lasso" | "pen" | "poly">("rect");
  // chips directly toggle the tool: click active chip again → tool off
  const setRegionShapeTool = (k: "rect" | "lasso" | "pen" | "poly") => {
    if (regionTool && shapeTool === k) setRegionTool(false);
    else {
      setShapeTool(k);
      setRegionTool(true);
    }
  };
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());

  const model = useMemo(
    () => models.find((m) => m.id === modelId) ?? null,
    [models, modelId],
  );

  const activeDesign = designs.find((d) => d.id === designId) ?? null;
  const activeViz = activeDesign?.visualizations[0] ?? null;
  const revisions: Revision[] = activeViz?.revisions ?? [];
  const currentId = activeViz?.current_revision_id ?? null;
  const currentRev = revisions.find((r) => r.id === currentId) ?? null;

  useEffect(() => {
    const acceptModels = (next: ModelInfo[]) => {
      setModels(next);
      setModelId((current) =>
        next.some((model) => model.id === current)
          ? current
          : next[0]?.id ?? RECOMMENDED_ID,
      );
    };
    getHealth()
      .then((h) => setServerKey(!!h.key_configured))
      .catch(() => setServerKey(false));
    getModels()
      .then(acceptModels)
      .catch((e) => fail(e));
    const refreshModels = () => {
      getModels().then(acceptModels).catch(() => {});
    };
    const startupRefresh = window.setTimeout(refreshModels, 30_000);
    const dailyRefresh = window.setInterval(
      refreshModels,
      25 * 60 * 60 * 1000,
    );
    listProjects(true)
      .then(setProjects)
      .catch((e) => fail(e));
    return () => {
      window.clearTimeout(startupRefresh);
      window.clearInterval(dailyRefresh);
    };
  }, []);

  // keep a valid design selected after project/state changes
  useEffect(() => {
    if (designs.length > 0) {
      if (!designs.some((d) => d.id === designId)) setDesignId(designs[0].id);
    } else {
      setDesignId(null);
    }
  }, [designs, designId]);

  useEffect(() => {
    setCompareIds([]);
  }, [designId, projectId, designRatio]);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t0 = Date.now();
    const iv = setInterval(
      () => setElapsed(Math.round((Date.now() - t0) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, [busy]);

  // one shared catch: show the error message in the banner
  const fail = (e: unknown) =>
    setBanner(e instanceof Error ? e.message : String(e));

  const loadProject = async (id: number) => {
    setProjectId(id);
    setDesignId(null);
    try {
      const d = await getProject(id);
      setDesigns(d.designs);
    } catch (e) {
      fail(e);
    }
  };

  const reload = async () => {
    if (projectId == null) return;
    const d = await getProject(projectId);
    setDesigns(d.designs);
  };

  // Nothing is selected on a fresh launch (also after an app update), so the
  // project dropdown showed a name while no designs were loaded. Select the
  // newest project as soon as the list arrives, and recover if the selected
  // project disappears.
  useEffect(() => {
    if (projects.length === 0) {
      if (projectId != null) {
        setProjectId(null);
        setDesigns([]);
      }
      return;
    }
    if (projectId == null || !projects.some((p) => p.id === projectId)) {
      void loadProject(projects[0].id);
    }
    // loadProject only closes over setters; the list + selection drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, projectId]);

  const handleNewProject = async (name: string) => {
    try {
      const p = await createProject(name);
      setProjects((prev) => [...prev, p]);
      await loadProject(p.id);
    } catch (e) {
      fail(e);
    }
  };

  const handleUpload = async (file: File | null) => {
    if (!file || projectId == null) return;
    setBanner("");
    try {
      const isFirst = designs.length === 0;
      const [d, dims] = await Promise.all([
        uploadDesign(projectId, isFirst ? "Reference" : file.name, file),
        measureImage(file).catch(() => null),
      ]);
      setDesignRatio(dims?.ratio ?? null);
      const fresh = await getProject(projectId);
      const dd = fresh.designs.find((x) => x.id === d.id);
      if (dd && dd.visualizations.length === 0) {
        await createVisualization(d.id, "Renders", settings);
      }
      await reload();
      setDesignId(d.id);
    } catch (e) {
      fail(e);
    }
  };

  const runRender = async (parentOverride?: number) => {
    if (busy) return;
    if (!model) {
      setBanner("No render engine selected — pick one in the header.");
      return;
    }
    if (!activeDesign) {
      setBanner("Import a design first.");
      return;
    }
    setBanner("");
    setBusy(true);
    try {
      let viz = activeViz;
      if (!viz)
        viz = await createVisualization(activeDesign.id, "Renders", settings);
      const { job_id } = await generate({
        model: model.id,
        design_id: activeDesign.id,
        visualization_id: viz.id,
        parent_revision_id: parentOverride ?? currentId ?? undefined,
        settings,
        aspect_ratio: designRatio ?? "auto",
      });
      const out = await pollUntil(
        () => getJob(job_id),
        (j) => j.status === "done" || j.status === "failed",
        2000,
      );
      if (out.status === "failed") {
        setBanner(out.error || "Render failed.");
      }
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // Edit tab: region edit of the current render → new minor revision
  const runEdit = async (edit: EditSpec) => {
    if (busy || !model || !activeDesign || !activeViz || !currentRev?.image_url)
    return;
    setBanner("");
    setBusy(true);
    try {
      // the edit source is the CURRENT RENDER, fed back as the img2img input
      const image_url = await imageUrlToDataUrl(currentRev.image_url);
      const { job_id } = await generate({
        model: model.id,
        image_url,
        edit,
        design_id: activeDesign.id,
        visualization_id: activeViz.id,
        parent_revision_id: currentRev.id,
      });
      const out = await pollUntil(
        () => getJob(job_id),
        (j) => j.status === "done" || j.status === "failed",
        2000,
      );
      if (out.status === "failed") {
        setBanner(out.error || "Edit failed.");
      }
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleSetCurrent = async (id: number) => {
    if (id === currentId) return;
    try {
      await restoreRevision(id);
      await reload();
    } catch (e) {
      fail(e);
    }
  };

  const handleDelete = async (id: number) => {
    const rev = revisions.find((r) => r.id === id);
    if (!rev) return;
    if (!window.confirm(`Delete ${rev.label}?`)) return;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await deleteRevision(id);
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setDeleting((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  // ---- project & design archive/delete -----------------------------------

  const handleRenameProject = async (id: number, name: string) => {
    try {
      await renameProject(id, name);
      setProjects((prev) =>
        prev.map((x) => (x.id === id ? { ...x, name } : x)),
      );
    } catch (e) {
      fail(e);
    }
  };

  const handleArchiveProject = async (id: number) => {
    const p = projects.find((x) => x.id === id);
    const archiving = !p?.archived;
    if (
      archiving &&
      !window.confirm(
        `Archive "${p?.name}"? Hide it from the project list until restored.`,
      )
    )
      return;
    try {
      await setProjectArchived(id, archiving);
      setProjects(await listProjects(true));
      if (projectId === id && archiving) {
        setProjectId(null);
        setDesigns([]);
      }
    } catch (e) {
      fail(e);
    }
  };

  const handleDeleteProject = async (id: number) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (
      !window.confirm(
        `Delete "${p.name}" and ALL its designs and renders? This cannot be undone.`,
      )
    )
      return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((x) => x.id !== id));
      if (projectId === id) {
        setProjectId(null);
        setDesigns([]);
      }
    } catch (e) {
      fail(e);
    }
  };

  const handleArchiveDesign = async (id: number, archived: boolean) => {
    try {
      await setDesignArchived(id, archived);
      await reload();
    } catch (e) {
      fail(e);
    }
  };

  const handleDeleteDesign = async (id: number) => {
    const d = designs.find((x) => x.id === id);
    if (
      !window.confirm(
        `Delete design "${d?.name}" and all its renders? This cannot be undone.`,
      )
    )
      return;
    try {
      await deleteDesign(id);
      await reload();
    } catch (e) {
      fail(e);
    }
  };

  // ---- user presets (model + visualization config + additional prompt) -----

  const handleSavePreset = () => {
    const name = window.prompt("Name the preset", "My Preset");
    if (name === null) return; // cancelled
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: Preset = { name: trimmed, modelId, settings };
    const next = presets.some((p) => p.name === trimmed)
      ? presets.map((p) => (p.name === trimmed ? preset : p))
      : [...presets, preset];
    savePresets(next);
    setPresets(next);
  };

  const handleApplyPreset = (p: Preset) => {
    setSettings({ ...DEFAULT_SETTINGS, ...p.settings });
    if (models.some((m) => m.id === p.modelId)) setModelId(p.modelId);
  };

  const handleDeletePreset = (name: string) => {
    const next = presets.filter((p) => p.name !== name);
    savePresets(next);
    setPresets(next);
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const pair = (): [Revision, Revision] | null => {
    if (compareIds.length !== 2) return null;
    const a = revisions.find((r) => r.id === compareIds[0]);
    const b = revisions.find((r) => r.id === compareIds[1]);
    return a && b ? [a, b] : null;
  };
  const compare = pair();

  // Edit tab: reset the tool state when the source revision changes
  useEffect(() => {
    setEditOps(DEFAULT_OPS);
    setShowOriginal(false);
  }, [currentRev?.id]);

  // Edit tab: model-free tools bake client-side, server stores the result
  const handleApplyEdit = async () => {
    if (busy || !activeViz || !currentRev?.image_url) return;
    setBusy(true);
    try {
      const blob = await bakeEdit(currentRev.image_url, editOps);
      await saveEdit(activeViz.id, currentRev.id, blob, editOps);
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // re-render the app (so shownBanner re-evaluates) whenever the header key changes
  const [, bumpKeyTick] = useReducer((x: number) => x + 1, 0);
  const shownBanner =
    banner ||
    (!hasUserKey() && !serverKey
      ? "No API key configured — paste yours in the header or set OPENROUTER_API_KEY on the server."
      : "");

  return (
    <div className="studio">
      <Header
        models={models}
        modelId={modelId}
        onModelChange={setModelId}
        serverKey={serverKey}
        onKeyChange={bumpKeyTick}
      />

      {shownBanner && <div className="banner-error">{shownBanner}</div>}

      <div className="studio-body">
        <LeftRail
          projects={projects}
          projectId={projectId}
          designs={designs}
          designId={designId}
          onProject={loadProject}
          onDesign={setDesignId}
          onNewProject={handleNewProject}
          onRenameProject={handleRenameProject}
          onUpload={handleUpload}
          onArchiveProject={handleArchiveProject}
          onDeleteProject={handleDeleteProject}
          onArchiveDesign={handleArchiveDesign}
          onDeleteDesign={handleDeleteDesign}
        />

        <div className="stage-col">
          <div className="stage-area">
          <CanvasStage
            projectId={projectId}
            referenceUrl={activeDesign?.image_url ?? null}
            referenceName={activeDesign?.name ?? null}
            renderUrl={currentRev?.image_url ?? null}
            renderLabel={
              currentRev
                ? `${currentRev.label} · ${shortModel(currentRev.model ?? "model")}`
                : null
            }
            tab={stageTab}
            onTab={setStageTab}
            busy={busy}
            editOps={editOps}
            showOriginal={showOriginal}
            regionTool={regionTool}
            shapeTool={shapeTool}
            onEditApply={runEdit}
            onUpload={handleUpload}
            onCreateProject={() => {
              const name = window.prompt(
                "Name the new project",
                "Untitled Project",
              );
              if (name === null) return; // cancelled
              handleNewProject(name.trim() || "Untitled Project");
            }}
          />
          {activeDesign && stageTab === "render" && (
            <PromptPanel
              value={settings.custom_instruction ?? ""}
              onChange={(v) =>
                setSettings({ ...settings, custom_instruction: v })
              }
            />
          )}
          </div>
          <Filmstrip
            revisions={revisions}
            currentId={currentId}
            compare={compareIds}
            deleting={deleting}
            onSetCurrent={handleSetCurrent}
            onBranch={(id) => runRender(id)}
            onCompare={toggleCompare}
            onDelete={handleDelete}
          />
        </div>

        <div className={stageTab === "edit" ? "pane-hidden" : "right-pane"}>
          <VisualizePanel
            settings={settings}
            onChange={setSettings}
            busy={busy}
            disabled={!activeDesign}
            engineName={model ? shortModel(model.id) : "…"}
            onRender={() => runRender()}
            elapsed={elapsed}
            presets={presets}
            onSavePreset={handleSavePreset}
            onApplyPreset={handleApplyPreset}
            onDeletePreset={handleDeletePreset}
          />
        </div>
        <div className={stageTab === "edit" ? "right-pane" : "pane-hidden"}>
          <EditPanel
            ops={editOps}
            disabled={!currentRev}
            busy={busy}
            regionTool={regionTool}
            shapeTool={shapeTool}
            onChange={(patch) => setEditOps({ ...editOps, ...patch })}
            onReset={() => setEditOps(DEFAULT_OPS)}
            onHoldOriginal={setShowOriginal}
            onShapeTool={setRegionShapeTool}
            onApply={handleApplyEdit}
          />
        </div>
      </div>

      {compare && (
        <Modal onClose={() => setCompareIds([])}>
          <div className="cmp-head">
            <span>
              {compare[0].label} vs {compare[1].label}
            </span>
            <span className="dim">
              current:{" "}
              {compare.find((c) => c.id === currentId)?.label ?? "none"}
            </span>
          </div>
          <CompareView a={compare[0]} b={compare[1]} currentId={currentId} />
        </Modal>
      )}
    </div>
  );
}
