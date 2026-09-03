import { useRef } from "react";

interface CanvasStageProps {
  projectId: number | null;
  referenceUrl: string | null;
  referenceName: string | null;
  renderUrl: string | null;
  renderLabel: string | null;
  busy: boolean;
  onUpload: (f: File | null) => void;
  onCreateProject: () => void;
}

export default function CanvasStage({
  projectId,
  referenceUrl,
  referenceName,
  renderUrl,
  renderLabel,
  busy,
  onUpload,
  onCreateProject,
}: CanvasStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const setSplit = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    el.style.setProperty("--p", `${Math.min(100, Math.max(0, pct))}%`);
  };

  const dropZone = (
    <div
      className="stage-empty"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) onUpload(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      {projectId == null ? (
        <>
          <div className="empty-mark">＋</div>
          <h2>Start with a project</h2>
          <p>
            Create a project, then import your architectural design.
            <br />
            No prompts. No text-to-image.
          </p>
          <button className="btn-cta" onClick={onCreateProject}>
            New project
          </button>
        </>
      ) : (
        <>
          <div className="empty-mark">＋</div>
          <h2>Import your design</h2>
          <p>
            Drop a SketchUp viewport, clay render or exported view
            <br />— the geometry stays yours, Rendervous makes it photoreal.
          </p>
          <label className="btn-cta file-cta">
            Browse files
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                onUpload(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}
    </div>
  );

  if (!referenceUrl) {
    return (
      <main className="stage">
        {projectId == null ? null : (
          <div className="dropwarn">
            Drop an image anywhere on the stage to import it.
          </div>
        )}
        {dropZone}
      </main>
    );
  }

  return (
    <main className="stage">
      <div
        className="stage-wrap"
        ref={wrapRef}
        onPointerDown={(e) => {
          if (!renderUrl) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setSplit(e.clientX);
        }}
        onPointerMove={(e) => {
          if (renderUrl && e.buttons > 0) setSplit(e.clientX);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) onUpload(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <img
          className="img-base"
          src={referenceUrl}
          alt={referenceName ?? "design reference"}
        />
        {renderUrl && (
          <>
            <img
              className="img-top"
              src={renderUrl}
              alt={renderLabel ?? "render"}
            />
            <div className="stage-divider" />
          </>
        )}
      </div>
      <div className="stage-caption">
        <span className="cap-design">DESIGN · source of truth</span>
        {renderUrl && (
          <a
            className="btn-dl"
            href={renderUrl}
            download={`rendervous-${(renderLabel ?? "render").replace(/\s+/g, "-").toLowerCase()}.png`}
            title="Download this render"
            onClick={(e) => e.stopPropagation()}
          >
            ⤓ Download
          </a>
        )}
        {renderUrl && (
          <span className="cap-render">{renderLabel ?? "RENDER"}</span>
        )}
      </div>
      {renderUrl && (
        <div className="stage-hint">drag to compare design vs render</div>
      )}
    </main>
  );
}
