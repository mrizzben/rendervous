import { useRef, useState } from "react";
import type { Design, ProjectSummary } from "../api";
import { ACCEPTED_LIST, ACCEPTED_TYPES } from "../api";

interface LeftRailProps {
  projects: ProjectSummary[];
  projectId: number | null;
  designs: Design[];
  designId: number | null;
  busy: boolean;
  onProject: (id: number) => void;
  onDesign: (id: number) => void;
  onNewProject: (name: string) => void;
  onUpload: (file: File) => void;
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
  onUpload,
}: LeftRailProps) {
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined | null) => {
    setErr("");
    if (!f) return;
    if (!ACCEPTED_LIST.includes(f.type)) {
      setErr("Only JPEG, PNG or WebP images.");
      return;
    }
    onUpload(f);
  };

  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="rail-title">Project</div>
        <div className="rail-actions">
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
              </option>
            ))}
          </select>
          <input
            className="inp new-proj"
            placeholder="new project…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                onNewProject(newName.trim());
                setNewName("");
              }
            }}
          />
        </div>
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
        <span className="plus">＋</span> Import design
      </button>
      {err && <div className="rail-err">{err}</div>}

      <div className="rail-list">
        {designs.length === 0 && (
          <div className="rail-empty">
            {projectId == null
              ? "Create a project, then import your design."
              : "No views yet — import your first design (SketchUp viewport, clay render…)."}
          </div>
        )}
        {designs.map((d) => (
          <button
            key={d.id}
            className={`view-item ${d.id === designId ? "active" : ""}`}
            onClick={() => onDesign(d.id)}
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
          </button>
        ))}
      </div>

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
