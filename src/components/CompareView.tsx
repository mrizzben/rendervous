import { useRef } from 'react';
import type { Revision } from '../api';
import { fmtDate } from '../api';
import useSplit from './useSplit';

interface CompareProps {
  a: Revision;
  b: Revision;
  currentId: number | null;
}

export default function CompareView({ a, b, currentId }: CompareProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { set } = useSplit<HTMLDivElement>();

  return (
    <div className="compare-wrap">
      <div className="compare-toolbar">
        <span>
          <strong>{a.label}</strong> vs <strong>{b.label}</strong>
        </span>
        <span className="dim">
          current: <strong>{a.id === currentId ? a.label : b.id === currentId ? b.label : 'none'}</strong>
        </span>
      </div>
      <div
        className="compare"
        ref={ref}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          set(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) set(e.clientX);
        }}
      >
        <img src={a.image_url ?? ''} alt={a.label} />
        <img className="top" src={b.image_url ?? ''} alt={b.label} />
        <div className="divider" />
      </div>
      <div className="dim mt">
        Drag the slider to compare · use a revision's <em>Use as current</em> button to switch
      </div>
      <div className="mt" style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <strong>{a.label}</strong>
          <div className="dim">{fmtDate(a.created_at)}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <strong>{b.label}</strong>
          <div className="dim">{fmtDate(b.created_at)}</div>
        </div>
      </div>
    </div>
  );
}