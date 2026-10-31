import { useEffect, useRef, useState } from "react";
import { ACCEPTED_TYPES, type EditSpec } from "../api";
import { DEFAULT_OPS, drawInto, isDirty, type EditOps } from "../lib/imageEdit";
import { DownloadIcon, GripIcon, PlusIcon } from "../icons";
import useSplit from "./useSplit";

type Corner = "nw" | "ne" | "sw" | "se";
interface Sel {
  x: number;
  y: number;
  w: number;
  h: number;
}
type DragMode =
  | { mode: "create"; start: { x: number; y: number } }
  // resize: `start` is the fixed opposite corner
  | { mode: "resize"; start: { x: number; y: number } }
  | { mode: "move"; start: { x: number; y: number }; orig: Sel };

interface CanvasStageProps {
  projectId: number | null;
  referenceUrl: string | null;
  referenceName: string | null;
  renderUrl: string | null;
  renderLabel: string | null;
  tab: "render" | "edit";
  onTab: (t: "render" | "edit") => void;
  busy?: boolean;
  editOps: EditOps;
  showOriginal: boolean;
  regionTool: boolean;
  onEditApply?: (edit: EditSpec) => void;
  onUpload: (f: File | null) => void;
  onCreateProject: () => void;
}

const clampf = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const HANDLES: Corner[] = ["nw", "ne", "sw", "se"];

export default function CanvasStage({
  projectId,
  referenceUrl,
  referenceName,
  renderUrl,
  renderLabel,
  tab,
  onTab,
  busy,
  editOps,
  showOriginal,
  regionTool,
  onEditApply,
  onUpload,
  onCreateProject,
}: CanvasStageProps) {
  const { ref: wrapRef, set: setSplit } = useSplit<HTMLDivElement>();
  const compareMode = tab === "render";

  // ---- Edit tab: drag a region box on the rendered result ----------------
  const [sel, setSel] = useState<Sel | null>(null);
  const [instruction, setInstruction] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false); // recompute box once loaded
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  // selection edits a specific render — drop it when the render changes
  useEffect(() => {
    setSel(null);
    setInstruction("");
    setImgLoaded(false);
  }, [renderUrl]);
  // Esc clears the active selection (Edit tab only)
  useEffect(() => {
    if (compareMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compareMode]);

  // region-select tool off → drop any in-progress selection
  useEffect(() => {
    if (!regionTool) setSel(null);
  }, [regionTool]);

  // stage preview: redraw the rendered result with current edit ops (live)
  useEffect(() => {
    if (compareMode || !imgLoaded) return;
    const canvas = previewRef.current;
    if (!canvas) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const im = imgRef.current;
      if (!im) return;
      drawInto(im, canvas, showOriginal ? DEFAULT_OPS : editOps, 1400);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [compareMode, imgLoaded, editOps, showOriginal]);

  // displayed (object-fit: contain) image geometry within the overlay, in
  // CSS px; null until the image has loaded
  const imageBox = () => {
    const c = overlayRef.current;
    const im = imgRef.current;
    if (!c || !im || !im.naturalWidth) return null;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const scale = Math.min(cw / im.naturalWidth, ch / im.naturalHeight);
    const w = im.naturalWidth * scale;
    const h = im.naturalHeight * scale;
    return { scale, w, h, cw, ch, ox: (cw - w) / 2, oy: (ch - h) / 2 };
  };
  // pointer position in displayed-image coordinates (clamped to the image)
  const toImgPt = (e: { clientX: number; clientY: number }) => {
    const b = imageBox()!;
    const cr = overlayRef.current!.getBoundingClientRect();
    return {
      x: clampf(e.clientX - cr.left - b.ox, 0, b.w),
      y: clampf(e.clientY - cr.top - b.oy, 0, b.h),
    };
  };

  const onOverlayDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // interactions with the region mini-form (textarea/buttons) must not
    // start an overlay drag or eat the button click
    if ((e.target as HTMLElement).closest(".edit-form")) return;
    if (!imageBox()) return;
    e.preventDefault();
    const kind = (e.target as HTMLElement).dataset.handle as
      | Corner
      | "box"
      | undefined;
    const p = toImgPt(e);
    if (kind === "box" && sel) {
      dragRef.current = { mode: "move", start: p, orig: sel };
    } else if ((HANDLES as string[]).includes(kind ?? "") && sel) {
      // anchor on the opposite corner keeps the other edge fixed
      dragRef.current = {
        mode: "resize",
        start: {
          x: kind!.endsWith("w") ? sel.x + sel.w : sel.x,
          y: kind!.startsWith("n") ? sel.y + sel.h : sel.y,
        },
      };
    } else {
      dragRef.current = { mode: "create", start: p };
      setSel(null);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onOverlayMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const b = imageBox();
    if (!d || !b || e.buttons === 0) return;
    const p = toImgPt(e);
    if (d.mode === "create" || d.mode === "resize") {
      setSel({
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y),
      });
    } else {
      setSel({
        ...d.orig,
        x: clampf(d.orig.x + (p.x - d.start.x), 0, b.w - d.orig.w),
        y: clampf(d.orig.y + (p.y - d.start.y), 0, b.h - d.orig.h),
      });
    }
  };
  const onOverlayUp = () => {
    dragRef.current = null;
  };

  const applyRegion = () => {
    const b = imageBox();
    if (!sel || !b || !onEditApply || !instruction.trim()) return;
    // displayed px → natural image px (server expects native pixels)
    onEditApply({
      x: Math.max(0, Math.round(sel.x / b.scale)),
      y: Math.max(0, Math.round(sel.y / b.scale)),
      w: Math.max(1, Math.round(sel.w / b.scale)),
      h: Math.max(1, Math.round(sel.h / b.scale)),
      instruction: instruction.trim(),
    });
  };

  const dropZone = (
    <div
      className="stage-empty"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onUpload(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      {projectId == null ? (
        <>
          <div className="empty-mark">
            <PlusIcon size={26} />
          </div>
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
          <div className="empty-mark">
            <PlusIcon size={26} />
          </div>
          <h2>Import your design</h2>
          <p>
            Drop a SketchUp viewport, clay render or exported view
            <br />— the geometry stays yours, Rendervous makes it photoreal.
          </p>
          <label className="btn-cta file-cta">
            Browse files
            <input
              type="file"
              accept={ACCEPTED_TYPES}
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

  // edit-tab internals for the JSX below (image geometry + form placement)
  const ib = compareMode ? null : imageBox();
  const editPreviewOn = !compareMode && imgLoaded && (isDirty(editOps) || showOriginal);
  const hasSel = !!ib && !!sel && sel.w >= 4 && sel.h >= 4;
  const editForm = hasSel
    ? (() => {
        const s = sel!;
        const left = clampf(ib!.ox + s.x, 4, ib!.cw - 264);
        const below = ib!.oy + s.y + s.h + 8;
        const top = below + 118 > ib!.ch && s.y > 132 ? ib!.oy + s.y - 126 : below;
        return { left, top };
      })()
    : null;

  return (
    <main className="stage">
      {compareMode || !renderUrl ? (
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
            onUpload(e.dataTransfer.files?.[0] ?? null);
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
      ) : (
        <div
          className="stage-edit"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onUpload(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <img
            ref={imgRef}
            src={renderUrl!}
            alt={renderLabel ?? "render"}
            onLoad={() => setImgLoaded(true)}
          />
          <canvas
            className="stage-edit-preview"
            ref={previewRef}
            style={{ display: editPreviewOn ? "block" : "none" }}
          />
          {regionTool && (
          <div
            className="edit-overlay"
            ref={overlayRef}
            onPointerDown={onOverlayDown}
            onPointerMove={onOverlayMove}
            onPointerUp={onOverlayUp}
            onPointerCancel={onOverlayUp}
          >
            {ib && imgLoaded && sel && (
              <div
                className="edit-box"
                data-handle="box"
                style={{
                  // imgTick keeps the box geometry in sync after image load
                  left: oxOf(ib) + sel.x,
                  top: oyOf(ib) + sel.y,
                  width: sel.w,
                  height: sel.h,
                  opacity: ib.scale > 0 ? 1 : 0,
                }}
              >
                {HANDLES.map((c) => (
                  <span
                    key={c}
                    className={`edit-handle edit-handle-${c}`}
                    data-handle={c}
                  />
                ))}
              </div>
            )}
            {editForm && (
              <div
                className="edit-form"
                style={{ left: editForm!.left, top: editForm!.top }}
              >
                <textarea
                  className="inp edit-instr"
                  rows={2}
                  autoFocus
                  placeholder="What should change in this area? (everything outside stays as-is)"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
                <div className="edit-form-row">
                  <button
                    type="button"
                    className="btn-edit-apply"
                    disabled={!instruction.trim() || busy}
                    onClick={applyRegion}
                  >
                    {busy ? "Editing…" : "Apply edit"}
                  </button>
                  <button
                    type="button"
                    className="btn-edit-cancel"
                    onClick={() => {
                      setSel(null);
                      setInstruction("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
              <div className="stage-hint">select area · everything outside stays untouched</div>
          </div>
          )}
        </div>
      )}
      {renderUrl && (
        <div className="stage-tabs">
          <button
            type="button"
            className={`stage-tab ${compareMode ? "active" : ""}`}
            onClick={() => onTab("render")}
          >
            Render
          </button>
          <button
            type="button"
            className={`stage-tab ${!compareMode ? "active" : ""}`}
            onClick={() => onTab("edit")}
          >
            Edit
          </button>
        </div>
      )}
      <div className="stage-caption">
        {compareMode && <span className="cap-design">DESIGN · source of truth</span>}
        {renderUrl && (
          <span className="cap-right">
            <a
              className="btn-dl"
              href={renderUrl}
              download={`rendervous-${(renderLabel ?? "render").replace(/\s+/g, "-").toLowerCase()}.png`}
              title="Download this render"
              onClick={(e) => e.stopPropagation()}
            >
              <DownloadIcon size={13} />
              Download
            </a>
            <span className="cap-render">{renderLabel ?? "RENDER"}</span>
          </span>
        )}
      </div>
      {compareMode && renderUrl && (
        <div className="stage-hint">
          <GripIcon size={11} /> drag to compare design vs render
        </div>
      )}
    </main>
  );

  // helpers referencing imageBox at JSX site (kept small & local)
  function oxOf(b: NonNullable<ReturnType<typeof imageBox>>) {
    return b.ox;
  }
  function oyOf(b: NonNullable<ReturnType<typeof imageBox>>) {
    return b.oy;
  }
}
