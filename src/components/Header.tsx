import { useMemo, useState } from "react";
import type { ModelInfo } from "../api";
import { fmtPrice, hasUserKey, saveKey, shortModel, storedKey } from "../api";
import { KeyIcon, MarkIcon } from "../icons";

interface HeaderProps {
  models: ModelInfo[];
  modelId: string;
  onModelChange: (id: string) => void;
  serverKey: boolean;
  onKeyChange?: () => void;
}

export default function Header({
  models,
  modelId,
  onModelChange,
  serverKey,
  onKeyChange,
}: HeaderProps) {
  const [apiKey, setApiKey] = useState(() => storedKey());
  const sortedModels = useMemo(
    () =>
      [...models].sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
        return a.id.localeCompare(b.id);
      }),
    [models],
  );

  return (
    <header className="header">
      <div className="brand">
        <MarkIcon size={18} className="brand-mark" />
        <div className="brand-txt">
          <span className="brand-name">
            Render<em>vous</em>
          </span>
          <span className="brand-sub">architectural visualization studio</span>
        </div>
      </div>
      <div className="grow" />

      <label className="keybox">
        <span
          className={`keydot ${hasUserKey() || serverKey ? "ok" : "missing"}`}
          title={
            hasUserKey()
              ? "Your OpenRouter key is set (stored in this browser)"
              : serverKey
                ? "Server key configured (OPENROUTER_API_KEY)"
                : "No API key configured"
          }
        />
        <KeyIcon size={14} className="keybox-icon" />
        <span className="keybox-label">Key</span>
        <input
          type="password"
          placeholder="OpenRouter API key"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            saveKey(e.target.value);
            onKeyChange?.();
          }}
        />
      </label>

      <label className="modelbox">
        <span className="modelbox-label">Engine</span>
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          title="OpenRouter image model used as the render engine"
        >
          {models.length === 0 && (
            <option value="">loading render engines…</option>
          )}
          {sortedModels.map((m) => (
            <option key={m.id} value={m.id}>
              {shortModel(m.id)} · {fmtPrice(m.price_usd, m.price_unit)}
              {m.recommended ? " ★" : ""}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
