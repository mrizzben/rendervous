import { useEffect, useRef, useState } from "react";
import { ACCEPTED_TYPES, type EditSpec } from "../api";
import { DEFAULT_OPS, drawInto, isDirty, type EditOps } from "../lib/imageEdit";
import { DownloadIcon, GripIcon, PlusIcon } from "../icons";
import useSplit from "./useSplit";

type Corner = "nw" | "ne" | "sw" | "se";
export type ShapeKind = "rect" | "lasso" | "pen" | "poly";
type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "lasso"; pts: { x: number; y: number }[] }
  | { kind: "poly"; pts: { x: number; y: number }[]; closed: boolean }
  | { kind: "pen"; pts: { x: number; y: number }[]; width: number };

function bboxOf(s: Shape): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (s.kind === "rect") return { x: s.x, y: s.y, w: s.w, h: s.h };
  // lasso/poly share the vertex-bbox logic; pen expands by its tip radius
  const xs = s.pts.map((p) => p.x);
  const ys = s.pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const pad = s.kind === "pen" ? s.width / 2 : 0;
  return {
    x: x0 - pad,
    y: y0 - pad,
    w: Math.max(...xs) - x0 + pad * 2,
    h: Math.max(...ys) - y0 + pad * 2,
  };
}

type DragMode =
  | { mode: "create"; start: { x: number; y: number } }
  // lasso/pen: collect the pointer path
  | { mode: "draw" }
  // resize: `start` is the fixed opposite corner
  | { mode: "resize"; start: { x: number; y: number } }
  | { mode: "move"; start: { x: number; y: number }; orig: Shape };

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
  shapeTool: ShapeKind;
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
  shapeTool,
  onEditApply,
  onUpload,
  onCreateProject,
}: CanvasStageProps) {
  const { ref: wrapRef, set: setSplit } = useSplit<HTMLDivElement>();
  const compareMode = tab === "render";

  // ---- Edit tab: drag a region box on the rendered result ----------------
  const [sel, setSel] = useState<Shape | null>(null);
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

  // region-select tool off or shape switched → drop any in-progress selection
  useEffect(() => {
    if (!regionTool) setSel(null);
  }, [regionTool]);
  useEffect(() => {
    setSel(null);
  }, [shapeTool]);

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
    const b = imageBox();
    if (!b) return;
    e.preventDefault();
    const kind = (e.target as HTMLElement).dataset.handle as
      | Corner
      | "box"
      | undefined;
    const p = toImgPt(e);
    if (shapeTool === "poly") {
      // click-to-place-vertices; clicking near the first vertex closes
      dragRef.current = { mode: "draw" };
      setSel((prev) => {
        if (prev?.kind !== "poly") return { kind: "poly", pts: [p], closed: false };
        if (
          prev.pts.length >= 3 &&
          Math.hypot(p.x - prev.pts[0].x, p.y - prev.pts[0].y) < 10
        )
          return { ...prev, closed: true };
        return { ...prev, pts: [...prev.pts, p] };
      });
    } else if (shapeTool === "lasso" || shapeTool === "pen") {
      dragRef.current = { mode: "draw" };
      setSel(
        shapeTool === "lasso"
          ? { kind: "lasso", pts: [p] }
          : {
              kind: "pen",
              pts: [p],
              width: Math.max(8, Math.min(36, 0.055 * Math.min(b.w, b.h))),
            },
      );
    } else if (kind === "box" && sel?.kind === "rect") {
      dragRef.current = { mode: "move", start: p, orig: sel };
    } else if ((HANDLES as string[]).includes(kind ?? "") && sel?.kind === "rect") {
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
    if (d.mode === "draw") {
      // poly vertices are placed by clicks only — pointer moves are ignored
      setSel((prev) => {
        if (!prev || prev.kind === "rect" || prev.kind === "poly") return prev;
        const last = prev.pts[prev.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 3) return prev;
        return { ...prev, pts: [...prev.pts, p] };
      });
    } else if (d.mode === "create" || d.mode === "resize") {
      setSel({
        kind: "rect",
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y),
      });
    } else if (d.orig.kind === "rect") {
      setSel({
        kind: "rect",
        x: clampf(d.orig.x + (p.x - d.start.x), 0, b.w - d.orig.w),
        y: clampf(d.orig.y + (p.y - d.start.y), 0, b.h - d.orig.h),
        w: d.orig.w,
        h: d.orig.h,
      });
    }
  };
  const onOverlayUp = () => {
    dragRef.current = null;
  };
  // double-click closes an in-progress polygon
  const onOverlayDbl = () => {
    setSel((prev) =>
      prev?.kind === "poly" && prev.pts.length >= 3 && !prev.closed
        ? { ...prev, closed: true }
        : prev,
    );
  };

  const applyRegion = () => {
    const b = imageBox();
    if (!sel || !b || !onEditApply || !instruction.trim()) return;
    if (sel.kind === "lasso" && sel.pts.length < 3) return;
    if (sel.kind === "pen" && sel.pts.length < 2) return;
    if (sel.kind === "poly" && (!sel.closed || sel.pts.length < 3)) return;
    // displayed px → natural image px (server expects native pixels)
    const nat = (v: number) => Math.round(v / b.scale);
    const bb = bboxOf(sel);
    const base = {
      x: Math.max(0, nat(bb.x)),
      y: Math.max(0, nat(bb.y)),
      w: Math.max(1, nat(bb.w)),
      h: Math.max(1, nat(bb.h)),
      instruction: instruction.trim(),
      // poly reuses the server's lasso kind (same marker + prompt path)
      kind: sel.kind === "poly" ? ("lasso" as const) : sel.kind,
    };
    if (sel.kind === "rect") {
      onEditApply(base);
      return;
    }
    // lasso/poly/pen all travel as kind "lasso"|"pen" shapes + points; poly
    // deliberately reuses the server's lasso kind (same marker rendering)
    const points: number[] = [];
    for (const p of sel.pts) {
      points.push(Math.max(0, nat(p.x)), Math.max(0, nat(p.y)));
    }
    onEditApply({
      ...base,
      points,
      ...(sel.kind === "pen"
        ? { width: Math.max(4, Math.round(sel.width / b.scale)) }
        : {}),
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
  const hasSel =
    !!ib &&
    !!sel &&
    (sel.kind === "rect"
      ? sel.w >= 4 && sel.h >= 4
      : sel.pts.length >= (sel.kind === "lasso" ? 3 : 2) &&
        (() => {
          const bb = bboxOf(sel);
          return bb.w >= 4 && bb.h >= 4;
        })());
  const sbox = sel ? bboxOf(sel) : null;
  const editForm = hasSel && sbox
    ? (() => {
        const left = clampf(ib!.ox + sbox.x, 4, ib!.cw - 264);
        const below = ib!.oy + sbox.y + sbox.h + 8;
        const top =
          below + 118 > ib!.ch && sbox.y > 132 ? ib!.oy + sbox.y - 126 : below;
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
            onDoubleClick={onOverlayDbl}
          >
            {ib && imgLoaded && sel?.kind === "rect" && (
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
            {ib && imgLoaded && sel?.kind === "poly" && sel.pts.length >= 2 && (
              <svg
                className="edit-shape-svg"
                style={{ left: ib.ox, top: ib.oy, width: ib.w, height: ib.h }}
                viewBox={`0 0 ${ib.w} ${ib.h}`}
              >
                {sel.closed ? (
                  <polygon
                    className="sel-lasso"
                    points={sel.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  />
                ) : (
                  <polyline
                    className="sel-poly-open"
                    points={sel.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  />
                )}
              </svg>
            )}
            {ib && imgLoaded && sel?.kind === "lasso" && sel.pts.length >= 2 && (
              <svg
                className="edit-shape-svg"
                style={{ left: ib.ox, top: ib.oy, width: ib.w, height: ib.h }}
                viewBox={`0 0 ${ib.w} ${ib.h}`}
              >
                <polygon
                  className="sel-lasso"
                  points={sel.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                />
              </svg>
            )}
            {ib && imgLoaded && sel?.kind === "pen" && sel.pts.length >= 2 && (
              <svg
                className="edit-shape-svg"
                style={{ left: ib.ox, top: ib.oy, width: ib.w, height: ib.h }}
                viewBox={`0 0 ${ib.w} ${ib.h}`}
              >
                <polyline
                  className="sel-pen"
                  points={sel.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  strokeWidth={sel.width}
                />
                <polyline
                  className="sel-pen-line"
                  points={sel.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  strokeWidth={Math.max(2, sel.width * 0.12)}
                />
              </svg>
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
