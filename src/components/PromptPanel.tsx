import { useRef, useState, type PointerEvent } from "react";

/**
 * Floating prompt panel over the stage. Draggable by its header bar,
 * minimizable to just the header. Position is optional: until first drag it
 * sits bottom-right via CSS, then it moves to explicit left/top coordinates.
 */
export default function PromptPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [min, setMin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // clicks on buttons must not start a drag (capture would eat their click)
    if ((e.target as HTMLElement).closest("button")) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const pr = el.parentElement?.getBoundingClientRect();
    if (!pr) return;
    // clamp inside the stage area
    setPos({
      x: Math.min(
        Math.max(0, e.clientX - pr.left - drag.current.dx),
        pr.width - el.offsetWidth,
      ),
      y: Math.min(
        Math.max(0, e.clientY - pr.top - drag.current.dy),
        pr.height - el.offsetHeight,
      ),
    });
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <div
      className="prompt-float"
      ref={ref}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
          : undefined
      }
    >
      <div
        className="pf-head"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="rail-title">What should change?</span>
        <button
          type="button"
          className="pf-min"
          aria-label={min ? "Expand prompt panel" : "Minimize prompt panel"}
          title={min ? "Expand" : "Minimize"}
          onClick={() => setMin(!min)}
        >
          {min ? "+" : "–"}
        </button>
      </div>
      {!min && (
        <div className="pf-body">
          <textarea
            className="inp detail-inp"
            placeholder="e.g. Make the facade exposed concrete · dark teak floor · overcast sky"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
