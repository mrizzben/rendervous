import { useRef } from "react";

/**
 * Split-compare slider shared by CanvasStage and CompareView.
 * Writes the pointer position as the CSS custom property `--p` (0-100%),
 * which the stylesheet uses to position the top image's clip and divider.
 */
export default function useSplit<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const set = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    el.style.setProperty("--p", `${Math.min(100, Math.max(0, pct))}%`);
  };
  return { ref, set };
}
