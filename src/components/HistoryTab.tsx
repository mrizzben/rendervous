import type { Job } from '../api';
import { fmtDate, shortModel } from '../api';

interface HistoryProps {
  jobs: Job[];
  refreshNonce: number;
  onRefresh: () => void;
}

export default function HistoryTab({ jobs, refreshNonce, onRefresh }: HistoryProps) {
  const all = [...jobs].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  return (
    <div className="panel" style={{ margin: 16 }}>
      <div className="flex" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>History</h3>
        <button className="btn-ghost" onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>
      <p className="dim" style={{ margin: '8px 0' }}>
        Session history (this browser tab). The backend has no job-list endpoint in the MVP.
      </p>
      {all.length === 0 && <div className="empty">No jobs yet this session.</div>}
      <div style={{ marginTop: 10 }}>
        {all.map((j) => (
          <div key={j.id} className="history-item">
            {j.image_url ? (
              <img src={j.image_url} alt="" />
            ) : (
              <div className="badge" style={{ alignSelf: 'center' }}>
                {j.status}
              </div>
            )}
            <div className="hi-info">
              <div className="hi-prompt" title={j.prompt}>{j.prompt || '(auto-built architectural prompt)'}</div>
              <div className="hi-meta">
                <span className="model">{j.model ? shortModel(j.model) : '?'}</span> · {j.params?.width}×{j.params?.height} · {j.params?.steps} steps · cfg {j.params?.cfg} · seed {j.params?.seed ?? 'rand'}
                {j.params?.denoise != null && ` · denoise ${j.params.denoise}`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className={`badge ${j.status}`}>{j.status}</span>
              <span className="dim">{fmtDate(j.created_at ?? '')}</span>
            </div>
          </div>
        ))}
      </div>
      <span style={{ display: 'none' }}>{refreshNonce}</span>
    </div>
  );
}