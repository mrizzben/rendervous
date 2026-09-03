import { useRef, useState } from 'react';
import { acceptedImage, toDataUrl } from '../api';

interface ImageUploadProps {
  value: string | null; // data URL
  onChange: (url: string | null) => void;
  label?: string;
}

export default function ImageUpload({ value, onChange, label }: ImageUploadProps) {
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File | undefined | null) => {
    setErr('');
    if (!f) return;
    if (!acceptedImage(f)) {
      setErr('Only JPEG, PNG or WebP images are accepted.');
      return;
    }
    try {
      onChange(await toDataUrl(f));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to read image.');
    }
  };

  return (
    <div>
      <div
        className={`upload ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {label && <div className="dim" style={{ marginBottom: 6 }}>{label}</div>}
        {value ? (
          <>
            <img src={value} alt="reference" />
            <div className="dim">Click or drop to replace · capped at 2048px</div>
          </>
        ) : (
          <>Click or drop a reference image here<br /><span className="dim">JPEG · PNG · WebP — the design is the source of truth</span></>
        )}
      </div>
      {value && (
        <div className="flex">
          <button className="btn-ghost danger-text" style={{ borderColor: '#e53935' }} onClick={() => onChange(null)}>
            ✕ Clear image
          </button>
        </div>
      )}
      {err && <div className="banner-error mt">{err}</div>}
    </div>
  );
}