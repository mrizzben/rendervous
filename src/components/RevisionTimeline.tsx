import { useState } from 'react';
import type { Job, Revision } from '../api';
import { shortModel } from '../api';

interface TimelineProps {
  revisions: Revision[];
  currentId: number | null;
  compare: number[]; // selected revision ids for compare (0,1,2)
  onCompare: (id: number) => void;
  onRestore: (id: number) => void;
  onBranch: (id: number) => void;
  onDelete: (id: number) => void;
  deleting: Set<number>;
  busy: boolean;
}

export default function RevisionTimeline({
  revisions,
  currentId,
  compare,
  onCompare,
  onRestore,
  onBranch,
  onDelete,
  deleting,
  busy,
}: TimelineProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (revisions.length === 0) {
    return <div className="empty">No revisions yet — configure and generate.</div>;
  }

  const sorted = [...revisions].sort((a, b) => a.id - b.id);
  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="timeline">
      {sorted.map((r) => (
        <div key={r.id} className={`rev-node ${r.id === currentId ? 'current' : ''}`}>
          <div className="rev-body">
            <div className="rev-head">
              <span className="label">{r.label}</span>
              {r.id === currentId && <span className="chip-current">current</span>}
              {compare.includes(r.id) && <span className="chip-current" style={{ background: '#0d7377' }}>compare</span>}
              <span className="meta">
                {r.model ? shortModel(r.model) : '?'} · {r.params?.steps ?? '?'} steps · cfg {r.params?.cfg ?? '?'} · seed {r.params?.seed ?? 'rand'}
              </span>
            </div>

            {r.image_url && <img className="rev-thumb" src={r.image_url} alt={r.label} />}
            <div className="rev-prompt">
              {r.prompt.length > 120 && !expanded.has(r.id) ? r.prompt.slice(0, 120) + '…' : r.prompt}
              {r.prompt.length > 120 && (
                <button className="btn-ghost" style={{ marginLeft: 6, padding: '0 6px' }} onClick={() => toggle(r.id)}>
                  {expanded.has(r.id) ? 'less' : 'more'}
                </button>
              )}
            </div>
            <div className="rev-actions">
              <button className="btn-mini" disabled={busy || r.id === currentId} onClick={() => onRestore(r.id)} title={r.id === currentId ? 'Already current' : 'Set as current revision'}>
                Use as base
              </button>
              <button className="btn-mini" disabled={busy} onClick={() => onBranch(r.id)} title="Branch: generate a new revision derived from this one">
                Branch
              </button>
              <button className={`btn-mini ${compare.includes(r.id) ? 'sel' : ''}`} disabled={busy || (compare.length >= 2 && !compare.includes(r.id))} onClick={() => onCompare(r.id)}>
                Compare
              </button>
              <button className="btn-mini danger" disabled={busy || deleting.has(r.id)} onClick={() => onDelete(r.id)} title="Delete this revision">
                {deleting.has(r.id) ? '…' : '✕'}
              </button>
            </div>
          </div>
        </div>
      ))}
      <div className="dim" style={{ marginTop: 4 }}>Branching keeps history — current stays highlighted.</div>
    </div>
  );
}

export type { Job };