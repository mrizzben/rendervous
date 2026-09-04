// Minimal typed API client for the Rendervous backend.
// The backend proxies OpenRouter; the user's own key is sent as X-OpenRouter-Key.

export interface Health {
  ok: boolean;
  key_configured?: boolean;
}

export type PriceUnit = "image" | "megapixel" | "token";

export interface ModelInfo {
  id: string;
  name: string;
  recommended: boolean;
  input_price: number | null;
  price_usd: number | null; // USD per unit (image, megapixel, or token)
  price_unit: PriceUnit | null;
  context_length: number | null;
}

export interface Job {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  progress: number | null;
  image_url: string | null;
  error: string | null;
  model: string | null;
  prompt: string;
  params: {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    denoise: number;
    seed: number;
  };
  created_at?: string;
}

export interface ProjectSummary {
  id: number;
  name: string;
  created_at: string;
  design_count: number;
  visualization_count: number;
  archived: boolean;
}

export interface Revision {
  id: number;
  parent_revision_id: number | null;
  label: string;
  prompt: string;
  model: string | null;
  params: Job["params"] | null;
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
  archived?: boolean;
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
  style: "photoreal" | "editorial" | "minimal" | "atmospheric";
  lighting: "daylight" | "overcast" | "golden_hour" | "sunset" | "night";
  material: "original" | "concrete" | "wood" | "stone" | "custom";
  environment: "none" | "tropical" | "urban" | "forest" | "custom";
  lamp_temp?: number; // Kelvin, 2700 (warm white) – 6000 (daylight)
  custom_instruction?: string;
}

export interface GenerationRequest {
  model?: string;
  prompt?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
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

interface ApiDesign {
  id: number;
  name: string;
  image_url: string | null;
  created_at: string;
  visualizations?: ApiViz[];
}
interface ApiViz {
  id: number;
  name: string;
  settings: Settings | null;
  current_revision_id: number | null;
  revisions?: Revision[];
}

// --- key handling -----------------------------------------------------------

const KEY_STORAGE = "rendervous_api_key";

export function storedKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function saveKey(k: string): void {
  localStorage.setItem(KEY_STORAGE, k.trim());
}

// Headers: BYOK overrides server env; always sent when present.
function authHeaders(): Record<string, string> {
  const k = storedKey();
  return k ? { "X-OpenRouter-Key": k } : {};
}

export function hasUserKey(): boolean {
  return storedKey().length > 0;
}

// --- helpers ----------------------------------------------------------------

/** Throw a descriptive Error for a non-2xx response (backend {detail|error}). */
async function parseError(res: Response): Promise<never> {
  let detail = "";
  try {
    const j = await res.json();
    detail = j.detail ?? j.error ?? JSON.stringify(j);
  } catch {
    detail = res.statusText;
  }
  throw new Error(`${res.status} ${detail}`);
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<T>;
}

// --- endpoints ----------------------------------------------------------------

export function getHealth(): Promise<Health> {
  return jfetch<Health>("/api/health");
}

export function getModels(): Promise<ModelInfo[]> {
  // backend wraps the list: { models: [...] }
  return jfetch<{ models: ModelInfo[] }>("/api/models").then((r) => r.models);
}

export function generate(req: GenerationRequest): Promise<{ job_id: number }> {
  return jfetch<{ job_id: number }>("/api/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function getJob(id: number): Promise<Job> {
  return jfetch<Job>(`/api/jobs/${id}`);
}

export function createProject(name: string): Promise<ProjectSummary> {
  return jfetch<ProjectSummary>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listProjects(
  includeArchived = false,
): Promise<ProjectSummary[]> {
  return jfetch<ProjectSummary[]>(
    `/api/projects${includeArchived ? "?include_archived=true" : ""}`,
  );
}

export function getProject(id: number): Promise<ProjectDetail> {
  return jfetch<ProjectDetail>(`/api/projects/${id}`);
}

export function renameProject(id: number, name: string): Promise<unknown> {
  return jfetch<unknown>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function setProjectArchived(
  id: number,
  archived: boolean,
): Promise<unknown> {
  return jfetch<unknown>(`/api/projects/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ archived }),
  });
}

export function deleteProject(id: number): Promise<unknown> {
  return jfetch<unknown>(`/api/projects/${id}`, { method: "DELETE" });
}

export function setDesignArchived(
  id: number,
  archived: boolean,
): Promise<unknown> {
  return jfetch<unknown>(`/api/designs/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ archived }),
  });
}

export function deleteDesign(id: number): Promise<unknown> {
  return jfetch<unknown>(`/api/designs/${id}`, { method: "DELETE" });
}

export function uploadDesign(
  projectId: number,
  name: string,
  file: File,
): Promise<ApiDesign> {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("file", file);
  return fetch(`/api/projects/${projectId}/designs`, {
    method: "POST",
    body: fd,
    headers: authHeaders(),
  }).then(async (res) => {
    if (!res.ok) await parseError(res);
    return res.json() as Promise<ApiDesign>;
  });
}

export function createVisualization(
  designId: number,
  name?: string,
  settings?: Settings,
): Promise<Visualization> {
  return jfetch<Visualization>("/api/visualizations", {
    method: "POST",
    body: JSON.stringify({ design_id: designId, name, settings }),
  });
}

export function restoreRevision(id: number): Promise<unknown> {
  return jfetch<unknown>(`/api/revisions/${id}/restore`, { method: "POST" });
}

export function deleteRevision(id: number): Promise<unknown> {
  return jfetch<unknown>(`/api/revisions/${id}`, { method: "DELETE" });
}

// --- aspect ratio detection ------------------------------------------------

/** Supported output aspect ratios, in preference order (first wins ties). */
export const ASPECT_RATIOS = [
  "1:1",
  "1:2",
  "1:4",
  "1:8",
  "2:1",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "9:19.5",
  "19.5:9",
  "9:20",
  "20:9",
  "9:21",
  "21:9",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Snap an image's dimensions to the nearest supported ratio.
 *  Compares log-ratios so 1:2 and 2:1 sit equal-and-opposite (a 2x-tall
 *  image is as "far" from 1:1 as a 2x-wide one). Ties: earliest in list.
 *  When `tol` is given and the nearest ratio is farther than `tol` (log
 *  distance), returns "auto" instead — degenerate inputs get a free-form
 *  match via prompt hint rather than a forced, visibly-wrong snap. */
export function closestAspectRatio(
  width: number,
  height: number,
  tol = Infinity,
): AspectRatio | "auto" {
  const v = Math.log(width / height);
  let best: AspectRatio = ASPECT_RATIOS[0];
  let bestD = Infinity;
  for (const r of ASPECT_RATIOS) {
    const [w, h] = r.split(":").map(Number);
    const d = Math.abs(v - Math.log(w / h));
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return bestD <= tol ? best : "auto";
}

/** Decode an image file just to read its dimensions + snapped ratio.
 *  Ratios farther than ~28% (log 0.25) from every listed option come back
 *  as "auto" so the renderer matches by prompt hint instead of a bad snap. */
export function measureImage(
  file: File,
): Promise<{ width: number; height: number; ratio: AspectRatio | "auto" }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported or corrupt image"));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.width,
        height: img.height,
        ratio: closestAspectRatio(img.width, img.height, 0.25),
      });
    };
    img.src = url;
  });
}

// --- file -> base64 data URL (client-side, capped at 2048px) ---------------

// File types the app accepts for design imports; shared with <input accept>
// and the upload validation in LeftRail.
export const ACCEPTED_LIST = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_TYPES = ACCEPTED_LIST.join(",");

// --- polling ----------------------------------------------------------------

export async function pollUntil<T>(
  fn: () => Promise<T>,
  isDone: (v: T) => boolean,
  intervalMs = 2000,
): Promise<T> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const v = await wait(0).then(fn);
    if (isDone(v)) return v;
    await wait(intervalMs);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// --- formatting -------------------------------------------------------------

export function fmtPrice(
  usd: number | string | null | undefined,
  unit?: PriceUnit | null,
): string {
  if (usd == null) return "—";
  const n = Number(usd);
  if (Number.isNaN(n)) return "—";
  // Display in the same unit OpenRouter uses on its models page: per image,
  // per megapixel, or per million tokens. Trailing zeros stripped (like the
  // site, which shows "$0.03 per image", not "$0.030").
  const trim = (x: number) => String(Number(x.toFixed(4)));
  switch (unit) {
    case "megapixel":
      return `$${trim(n)}/MP`;
    case "token":
      return `$${n * 1e6 >= 100 ? (n * 1e6).toFixed(0) : trim(n * 1e6)}/M tok`;
    default: // "image" (or unknown) — per image
      return `$${trim(n)}/img`;
  }
}

export function shortModel(id: string): string {
  // "google/gemini-2.5-flash-image" -> "gemini-2.5-flash-image"
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export type { ApiDesign };
