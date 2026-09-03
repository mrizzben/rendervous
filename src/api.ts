// Minimal typed API client for the Rendervous backend.
// The backend proxies OpenRouter; the user's own key is sent as X-OpenRouter-Key.

export interface Health { ok: boolean; key_configured?: boolean }

export interface ModelInfo {
  id: string;
  name: string;
  recommended: boolean;
  input_price: number | null; // USD per 1M prompt tokens
  image_price: number | null; // USD per image
  context_length: number | null;
}

export interface Job {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number | null;
  image_url: string | null;
  error: string | null;
  model: string | null;
  prompt: string;
  params: { width: number; height: number; steps: number; cfg: number; denoise: number; seed: number };
  created_at?: string;
}

export interface ProjectSummary {
  id: number;
  name: string;
  created_at: string;
  design_count: number;
  visualization_count: number;
}

export interface Revision {
  id: number;
  parent_revision_id: number | null;
  label: string;
  prompt: string;
  model: string | null;
  params: Job['params'] | null;
  image_url: string | null;
  created_at: string;
}

export interface Visualization {
  id: number;
  name: string;
  settings: Settings | null;
  current_revision_id: number | null;
  revisions: Revision[];
}

export interface Design {
  id: number;
  name: string;
  image_url: string | null;
  created_at: string;
  visualizations: Visualization[];
}

export interface ProjectDetail {
  id: number;
  name: string;
  designs: Design[];
  created_at?: string;
}

export interface Settings {
  fidelity: number; // 0-100, 90 = strict default
  lighting: 'daylight' | 'overcast' | 'golden_hour' | 'sunset' | 'night';
  material: 'original' | 'concrete' | 'wood' | 'stone' | 'custom';
  environment: 'none' | 'tropical' | 'urban' | 'forest' | 'custom';
  custom_instruction?: string;
}

export interface GenerationRequest {
  model?: string;
  prompt?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  denoise?: number;
  seed?: number;
  image_url?: string; // base64 data URL for img2img
  project_id?: number;
  design_id?: number;
  visualization_id?: number;
  parent_revision_id?: number;
  settings?: Settings;
}

interface ApiDesign { id: number; name: string; image_url: string | null; created_at: string; visualizations?: ApiViz[] }
interface ApiViz { id: number; name: string; settings: Settings | null; current_revision_id: number | null; revisions?: Revision[] }

// --- key handling -----------------------------------------------------------

const KEY_STORAGE = 'rendervous_api_key';

export function storedKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function saveKey(k: string): void {
  localStorage.setItem(KEY_STORAGE, k.trim());
}

// Headers: BYOK overrides server env; always sent when present.
function authHeaders(): Record<string, string> {
  const k = storedKey();
  return k ? { 'X-OpenRouter-Key': k } : {};
}

export function hasUserKey(): boolean {
  return storedKey().length > 0;
}

// --- helpers ----------------------------------------------------------------

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.detail ?? j.error ?? JSON.stringify(j);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// --- endpoints ----------------------------------------------------------------

export function getHealth(): Promise<Health> {
  return jfetch<Health>('/api/health');
}

export function getModels(refresh = false): Promise<ModelInfo[]> {
  // backend wraps the list: { models: [...] }
  return jfetch<{ models: ModelInfo[] }>(`/api/models${qs({ refresh: refresh ? 1 : undefined })}`).then((r) => r.models);
}

export function generate(req: GenerationRequest): Promise<{ job_id: number }> {
  return jfetch<{ job_id: number }>('/api/generate', { method: 'POST', body: JSON.stringify(req) });
}

export function getJob(id: number): Promise<Job> {
  return jfetch<Job>(`/api/jobs/${id}`);
}

export function createProject(name: string): Promise<ProjectSummary> {
  return jfetch<ProjectSummary>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
}

export function listProjects(): Promise<ProjectSummary[]> {
  return jfetch<ProjectSummary[]>('/api/projects');
}

export function getProject(id: number): Promise<ProjectDetail> {
  return jfetch<ProjectDetail>(`/api/projects/${id}`);
}

export function uploadDesign(projectId: number, name: string, file: File): Promise<ApiDesign> {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('file', file);
  return fetch(`/api/projects/${projectId}/designs`, {
    method: 'POST',
    body: fd,
    headers: authHeaders(),
  }).then(async (res) => {
    if (!res.ok) {
      let detail: string;
      try { const j = await res.json(); detail = j.detail ?? JSON.stringify(j); } catch { detail = res.statusText; }
      throw new Error(`${res.status} ${detail}`);
    }
    return res.json() as Promise<ApiDesign>;
  });
}

export function createVisualization(designId: number, name?: string, settings?: Settings): Promise<Visualization> {
  return jfetch<Visualization>('/api/visualizations', {
    method: 'POST',
    body: JSON.stringify({ design_id: designId, name, settings }),
  });
}

export function restoreRevision(id: number): Promise<unknown> {
  return jfetch<unknown>(`/api/revisions/${id}/restore`, { method: 'POST' });
}

export function deleteRevision(id: number): Promise<unknown> {
  return jfetch<unknown>(`/api/revisions/${id}`, { method: 'DELETE' });
}

// --- file -> base64 data URL (client-side, capped at 2048px) ---------------

const MAX_SIDE = 2048;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function acceptedImage(file: File): boolean {
  return ACCEPTED.includes(file.type);
}

export function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupt image'));
      img.onload = () => {
        const scale = Math.max(img.width, img.height) > MAX_SIDE ? MAX_SIDE / Math.max(img.width, img.height) : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas unavailable')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === 'image/webp' ? 'image/png' : file.type, 0.95));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// --- polling ----------------------------------------------------------------

export async function pollUntil<T>(fn: () => Promise<T>, isDone: (v: T) => boolean, intervalMs = 2000): Promise<T> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const v = await wait(0).then(fn);
    if (isDone(v)) return v;
    await wait(intervalMs);
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// --- formatting -------------------------------------------------------------

export function fmtPrice(usd: number | null | undefined): string {
  if (usd == null) return '—';
  return `$${usd.toFixed(usd < 0.001 ? 7 : 3)}/image`;
}

export function shortModel(id: string): string {
  // "google/gemini-2.5-flash-image" -> "gemini-2.5-flash-image"
  const slash = id.lastIndexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export interface ApiDesignOut extends ApiDesign {}
export type { ApiDesign, ApiViz };