import { useMemo, useState } from "react";
import type { ModelInfo } from "../api";
import { fmtPrice, hasUserKey, saveKey, shortModel, storedKey } from "../api";

interface HeaderProps {
  models: ModelInfo[];
  modelId: string;
  onModelChange: (id: string) => void;
  serverKey: boolean;
}

export default function Header({
  models,
  modelId,
  onModelChange,
  serverKey,
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
        <h1>
          Render<em>vous</em>
        </h1>
        <small>architectural visualization studio</small>
      </div>
      <div className="grow" />
      <div
        className="keybox"
        title={
          hasUserKey()
            ? "Your OpenRouter key (stored in this browser)"
            : "Set your OpenRouter API key to render"
        }
      >
        <span
          className={`keydot ${hasUserKey() || serverKey ? "ok" : "missing"}`}
        />
        <input
          type="password"
          placeholder="OpenRouter API key"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            saveKey(e.target.value);
          }}
        />
      </div>
      <div className="modelbox">
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
              {m.recommended ? "★" : ""}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
