import { useState } from 'react';
import type { Job } from '../api';
import { fmtDate, shortModel } from '../api';
import Modal from './Modal';

interface GalleryProps {
  jobs: Job[];
}

export default function Gallery({ jobs }: GalleryProps) {
  const [zoom, setZoom] = useState<{ url: string; job: Job } | null>(null);
  const done = jobs.filter((j) => j.status === 'done' && j.image_url);

  if (done.length === 0) {
    return <div className="empty">No generations yet — enter a prompt and hit Generate.</div>;
  }

  return (
    <>
      <div className="gallery">
        {done.map((j) => (
          <div key={j.id} className="cell" onClick={() => setZoom({ url: j.image_url!, job: j })}>
            <img src={j.image_url!} alt={j.prompt || 'generated'} loading="lazy" />
            <div className="overlay" title={j.prompt}>
              <span>{j.model ? shortModel(j.model) : '?'} · {j.params?.steps ?? '?'} steps · cfg {j.params?.cfg ?? '?'} · seed {j.params?.seed ?? '?'}</span>
              <span>{fmtDate(j.created_at ?? '')}</span>
            </div>
          </div>
        ))}
      </div>
      {zoom && (
        <Modal onClose={() => setZoom(null)}>
          <img src={zoom.url} alt="preview" />
          <div className="dim" style={{ marginTop: 8 }}>{zoom.job.prompt || '(no prompt)'}</div>
          <div className="dim" style={{ marginTop: 2 }}>
            {zoom.job.model ? shortModel(zoom.job.model) : '?'} · {zoom.job.params?.steps} steps · cfg {zoom.job.params?.cfg} · seed {zoom.job.params?.seed}
            {zoom.job.params?.denoise != null && ` · denoise ${zoom.job.params.denoise}`}
          </div>
        </Modal>
      )}
    </>
  );
}