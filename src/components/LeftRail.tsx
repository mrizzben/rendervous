import { useRef, useState } from "react";
import type { Design, ProjectSummary } from "../api";
import { ACCEPTED_LIST, ACCEPTED_TYPES, MAX_UPLOAD_MB } from "../api";
import {
  ArchiveIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  TrashIcon,
} from "../icons";

interface LeftRailProps {
  projects: ProjectSummary[];
  projectId: number | null;
  designs: Design[];
  designId: number | null;
  busy: boolean;
  onProject: (id: number) => void;
  onDesign: (id: number) => void;
  onNewProject: (name: string) => void;
  onRenameProject: (id: number, name: string) => void;
  onUpload: (file: File) => void;
  onArchiveProject: (id: number) => void;
  onDeleteProject: (id: number) => void;
  onArchiveDesign: (id: number, archived: boolean) => void;
  onDeleteDesign: (id: number) => void;
}

export default function LeftRail({
  projects,
  projectId,
  designs,
  designId,
  busy,
  onProject,
  onDesign,
  onNewProject,
  onRenameProject,
  onUpload,
  onArchiveProject,
  onDeleteProject,
  onArchiveDesign,
  onDeleteDesign,
}: LeftRailProps) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [err, setErr] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined | null) => {
    setErr("");
    if (!f) return;
    if (!ACCEPTED_LIST.includes(f.type)) {
      setErr("Only JPEG, PNG or WebP images.");
      return;
    }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setErr(`Image is too large — the max file size is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    onUpload(f);
  };

  const activeProject = projects.find((p) => p.id === projectId) ?? null;
  const commitRename = () => {
    if (
      renaming &&
      renameValue.trim() &&
      renameValue.trim() !== activeProject?.name
    ) {
      onRenameProject(projectId!, renameValue.trim());
    }
    setRenaming(false);
  };
  const shownDesigns = showArchived
    ? designs
    : designs.filter((d) => !d.archived);
  const hasArchived = designs.some((d) => d.archived);

  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="rail-title">Project</div>
        <select
          className="sel project-sel"
          value={projectId ?? ""}
          onChange={(e) => onProject(Number(e.target.value))}
          disabled={busy}
        >
          {projects.length === 0 && <option value="">—</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archived ? " · archived" : ""}
            </option>
          ))}
        </select>
        {renaming ? (
          <input
            className="inp new-proj"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={commitRename}
          />
        ) : (
          <div className="new-proj-row">
            <input
              className="inp new-proj"
              placeholder="new project…"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  onNewProject(newName.trim());
                  setNewName("");
                }
              }}
            />
            <button
              className="btn new-proj-add"
              disabled={busy || !newName.trim()}
              title="Create project"
              aria-label="Create project"
              onClick={() => {
                if (!newName.trim()) return;
                onNewProject(newName.trim());
                setNewName("");
              }}
            >
              <PlusIcon size={14} />
            </button>
          </div>
        )}
        {activeProject && (
          <div className="rail-manage">
            <button
              className="rail-mini"
              disabled={busy}
              title="Rename this project"
              onClick={() => {
                setRenameValue(activeProject!.name);
                setRenaming(true);
              }}
            >
              <PencilIcon size={13} />
              <span>Rename</span>
            </button>
            <button
              className="rail-mini"
              disabled={busy}
              title={
                activeProject.archived
                  ? "Restore this project to the active list"
                  : "Archive this project (hidden, not deleted)"
              }
              onClick={() => onArchiveProject(projectId!)}
            >
              {activeProject.archived ? (
                <RestoreIcon size={13} />
              ) : (
                <ArchiveIcon size={13} />
              )}
              <span>{activeProject.archived ? "Restore" : "Archive"}</span>
            </button>
            <button
              className="rail-mini danger"
              disabled={busy}
              title="Delete this project, its designs and renders permanently"
              onClick={() => onDeleteProject(projectId!)}
            >
              <TrashIcon size={13} />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      <button
        className="btn-import"
        disabled={busy || projectId == null}
        onClick={() => fileRef.current?.click()}
        title={
          projectId == null
            ? "Create a project first"
            : "Import a 3D viewport render / clay model image"
        }
      >
        <PlusIcon size={15} />
        <span>Import design</span>
      </button>
      {err && <div className="rail-err">{err}</div>}

      <div className="rail-list">
        {shownDesigns.length === 0 && (
          <div className="rail-empty">
            {projectId == null
              ? "Create a project, then import your design."
              : hasArchived
                ? "No active views — show archived to restore, or import a new design."
                : "No views yet — import your first design (SketchUp viewport, clay render…)."}
          </div>
        )}
        {shownDesigns.map((d) => (
          <div
            key={d.id}
            className={`view-item ${d.id === designId ? "active" : ""} ${
              d.archived ? "archived-design" : ""
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onDesign(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onDesign(d.id);
            }}
          >
            <div className="view-thumb">
              {d.image_url ? (
                <img src={d.image_url} alt={d.name} />
              ) : (
                <span className="noimg">—</span>
              )}
            </div>
            <div className="view-info">
              <strong>{d.name}</strong>
              <small>
                {d.visualizations[0]?.revisions.length ?? 0} render
                {d.visualizations[0]?.revisions.length === 1 ? "" : "s"}
              </small>
            </div>
            <div className="view-actions">
              <button
                className="rail-mini icon-only"
                disabled={busy}
                aria-label={
                  d.archived ? "Restore this design" : "Archive this design"
                }
                title={
                  d.archived
                    ? "Restore this design"
                    : "Archive this design (hidden, not deleted)"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onArchiveDesign(d.id, d.archived ? false : true);
                }}
              >
                {d.archived ? (
                  <RestoreIcon size={13} />
                ) : (
                  <ArchiveIcon size={13} />
                )}
              </button>
              <button
                className="rail-mini icon-only danger"
                disabled={busy}
                aria-label="Delete this design and its renders permanently"
                title="Delete this design and its renders permanently"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDesign(d.id);
                }}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasArchived && (
        <label className="rail-archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          show archived
        </label>
      )}

      <div className="rail-foot">
        <div className="dim">
          The imported design is the source of truth.
          <br />
          Geometry is preserved — appearance is rendered.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={{ display: "none" }}
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </aside>
  );
}
