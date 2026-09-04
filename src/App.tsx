import { useEffect, useMemo, useReducer, useState } from "react";
import type {
  Design,
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
  listProjects,
  measureImage,
  pollUntil,
  restoreRevision,
  setDesignArchived,
  setProjectArchived,
  shortModel,
  uploadDesign,
} from "./api";
import CanvasStage from "./components/CanvasStage";
import CompareView from "./components/CompareView";
import Filmstrip from "./components/Filmstrip";
import Header from "./components/Header";
import LeftRail from "./components/LeftRail";
import Modal from "./components/Modal";
import VisualizePanel from "./components/VisualizePanel";

const RECOMMENDED_ID = "bytedance-seed/seedream-5-0-pro";

const DEFAULT_SETTINGS: Settings = {
  fidelity: 90,
  style: "photoreal",
  lighting: "daylight",
  material: "original",
  environment: "none",
  lamp_temp: 3000, // Kelvin, warm white – daylight
  custom_instruction: "",
};

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
    getHealth()
      .then((h) => setServerKey(!!h.key_configured))
      .catch(() => setServerKey(false));
    getModels()
      .then(setModels)
      .catch((e) => fail(e));
    listProjects(true)
      .then(setProjects)
      .catch((e) => fail(e));
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

  const handleSetCurrent = async (id: number) => {
    if (busy || id === currentId) return;
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
          busy={busy}
          onProject={loadProject}
          onDesign={setDesignId}
          onNewProject={handleNewProject}
          onUpload={handleUpload}
          onArchiveProject={handleArchiveProject}
          onDeleteProject={handleDeleteProject}
          onArchiveDesign={handleArchiveDesign}
          onDeleteDesign={handleDeleteDesign}
        />

        <div className="stage-col">
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
            busy={busy}
            onUpload={handleUpload}
            onCreateProject={() => handleNewProject("Untitled Project")}
          />
          <Filmstrip
            revisions={revisions}
            currentId={currentId}
            compare={compareIds}
            busy={busy}
            deleting={deleting}
            onSetCurrent={handleSetCurrent}
            onBranch={(id) => runRender(id)}
            onCompare={toggleCompare}
            onDelete={handleDelete}
          />
        </div>

        <VisualizePanel
          settings={settings}
          onChange={setSettings}
          busy={busy}
          disabled={!activeDesign}
          engineName={model ? shortModel(model.id) : "…"}
          onRender={() => runRender()}
          elapsed={elapsed}
        />
      </div>

      {compare && (
        <Modal onClose={() => setCompareIds([])}>
          <div className="cmp-head">
            <span>
              {compare[0].label} vs {compare[1].label}
            </span>
            <span className="dim">
              current:{" "}
              {compare[0].id === currentId
                ? compare[0].label
                : compare[1].id === currentId
                  ? compare[1].label
                  : "none"}
            </span>
          </div>
          <CompareView a={compare[0]} b={compare[1]} currentId={currentId} />
        </Modal>
      )}
    </div>
  );
}
