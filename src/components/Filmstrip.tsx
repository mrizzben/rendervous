import type { Revision } from "../api";
import { fmtDate, shortModel } from "../api";

interface FilmstripProps {
  revisions: Revision[];
  currentId: number | null;
  compare: number[];
  busy: boolean;
  deleting: Set<number>;
  onSetCurrent: (id: number) => void;
  onBranch: (id: number) => void;
  onCompare: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function Filmstrip({
  revisions,
  currentId,
  compare,
  busy,
  deleting,
  onSetCurrent,
  onBranch,
  onCompare,
  onDelete,
}: FilmstripProps) {
  const sorted = [...revisions].sort((a, b) => a.id - b.id);

  return (
    <section className="filmstrip">
      <div className="film-head">
        <span className="rail-title">Revisions</span>
        {compare.length === 2 ? (
          <span className="dim">
            two selected — open Compare above the canvas
          </span>
        ) : (
          <span className="dim">
            {revisions.length === 0
              ? "renders appear here — the first is the base"
              : "click to make current · select two to compare"}
          </span>
        )}
      </div>
      {revisions.length === 0 ? (
        <div className="film-empty">
          No renders yet. Tune the Visualize panel and press Render.
        </div>
      ) : (
        <div className="film-row">
          {sorted.map((r) => (
            <div
              key={r.id}
              className={`film-cell ${r.id === currentId ? "current" : ""} ${compare.includes(r.id) ? "cmp" : ""}`}
              onClick={() => onSetCurrent(r.id)}
              title={`${r.label} · ${fmtDate(r.created_at)}`}
            >
              {r.image_url && (
                <img src={r.image_url} alt={r.label} loading="lazy" />
              )}
              <div
                className="film-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="fa"
                  disabled={busy}
                  title="Branch: new render derived from this one"
                  onClick={() => onBranch(r.id)}
                >
                  ⟳
                </button>
                <button
                  className={`fa ${compare.includes(r.id) ? "sel" : ""}`}
                  disabled={
                    busy || (compare.length >= 2 && !compare.includes(r.id))
                  }
                  title="Toggle compare"
                  onClick={() => onCompare(r.id)}
                >
                  ⌁
                </button>
                <button
                  className="fa danger"
                  disabled={busy || deleting.has(r.id)}
                  title="Delete"
                  onClick={() => onDelete(r.id)}
                >
                  ✕
                </button>
              </div>
              <div className="film-meta">
                <span className="film-label">{r.label}</span>
                {r.id === currentId && (
                  <span className="film-cur">current</span>
                )}
                <span className="film-sub">
                  {r.model ? shortModel(r.model) : "?"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
