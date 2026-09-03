export type TabId = 'txt2img' | 'img2img' | 'projects' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'txt2img', label: 'txt2img' },
  { id: 'img2img', label: 'img2img' },
  { id: 'projects', label: 'Projects' },
  { id: 'history', label: 'History' },
];

interface TabsProps {
  active: TabId;
  onChange: (t: TabId) => void;
  busy: boolean;
}

export default function Tabs({ active, onChange, busy }: TabsProps) {
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <button key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
      <span className="muted" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11 }}>
        {busy ? '⏳ job running…' : ''}
      </span>
    </div>
  );
}