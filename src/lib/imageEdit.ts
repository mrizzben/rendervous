/**
 * Model-free, deterministic edit operations (baked client-side; the server
 * only stores the result as a minor revision). All sliders run -100..100
 * except sharpen/vignette (0..100).
 */

export interface EditOps {
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  straighten: number;
  exposure: number;
  contrast: number;
  temperature: number;
  saturation: number;
  sharpen: number;
  vignette: number;
}

export const DEFAULT_OPS: EditOps = {
  rotate: 0,
  flipH: false,
  flipV: false,
  straighten: 0,
  exposure: 0,
  contrast: 0,
  temperature: 0,
  saturation: 0,
  sharpen: 0,
  vignette: 0,
};

export const isDirty = (ops: EditOps) =>
  JSON.stringify(ops) !== JSON.stringify(DEFAULT_OPS);

// ---- tone math: 4x5 color matrix (feColorMatrix values layout) -------------

type M = number[]; // [R.., G.., B.., A..] each row: 4 coeffs + offset

const IM: M = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

function mul(a: M, b: M): M {
  const out: M = new Array(20);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * b[k * 5 + c];
      // b's translate column does not propagate into linear terms
      if (c === 4) v += a[r * 5 + 4];
      out[r * 5 + c] = v;
    }
  return out;
}

function toneMatrix(ops: EditOps): M {
  let m: M = IM.slice();
  // exposure: linear light scale (±0.8 "stops" at extremes)
  const s = 1 + (ops.exposure / 100) * 0.8;
  m = mul(m, [s, 0, 0, 0, 0, 0, s, 0, 0, 0, 0, 0, s, 0, 0, 0, 0, 0, 1, 0]);
  // contrast around mid-gray
  const c = 1 + (ops.contrast / 100) * 0.6;
  const off = 0.5 * (1 - c);
  m = mul(m, [c, 0, 0, 0, off, 0, c, 0, 0, off, 0, 0, c, 0, off, 0, 0, 0, 1, 0]);
  // temperature: warm = more red, less blue (and vice versa)
  const t = (ops.temperature / 100) * 0.3;
  m = mul(m, [1 + t, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 - t, 0, 0, 0, 0, 0, 1, 0]);
  // saturation around luma
  const sat = 1 + ops.saturation / 100;
  m = mul(m, [
    0.213 + 0.787 * sat, 0.715 * (1 - sat), 0.072 * (1 - sat), 0, 0,
    0.213 * (1 - sat), 0.715 + 0.285 * sat, 0.072 * (1 - sat), 0, 0,
    0.213 * (1 - sat), 0.715 * (1 - sat), 0.072 + 0.928 * sat, 0, 0,
    0, 0, 0, 1, 0,
  ]);
  return m;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function applyTone(ctx: CanvasRenderingContext2D, w: number, h: number, m: M) {
  if (
    m[0] === 1 && m[6] === 1 && m[12] === 1 &&
    m[4] === 0 && m[9] === 0 && m[14] === 0
  )
    return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = clamp255(m[0] * r + m[1] * g + m[2] * b + m[4]);
    d[i + 1] = clamp255(m[5] * r + m[6] * g + m[7] * b + m[9]);
    d[i + 2] = clamp255(m[10] * r + m[11] * g + m[12] * b + m[14]);
  }
  ctx.putImageData(img, 0, 0);
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: number,
) {
  if (v <= 0) return;
  const g = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.38,
    w / 2, h / 2, Math.max(w, h) * 0.74,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${(v / 100) * 0.85})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Geometry (rotate/flip/straighten) + tone matrix + vignette in one pass.
 *  `maxDim` caps the render size for cheap live previews. */
export function drawInto(
  img: HTMLImageElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  ops: EditOps,
  maxDim = Infinity,
) {
  const w0 = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h0 = "naturalHeight" in img ? img.naturalHeight : img.height;
  if (!w0 || !h0) return;
  const f = Math.min(1, maxDim / w0, maxDim / h0);
  const cw = Math.round((ops.rotate % 180 ? h0 : w0) * f);
  const ch = Math.round((ops.rotate % 180 ? w0 : h0) * f);
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const A = ((ops.rotate + ops.straighten) * Math.PI) / 180;
  const ca = Math.abs(Math.cos(A));
  const sa = Math.abs(Math.sin(A));
  // scale so the rotated/straightened image always covers the frame
  const sw = w0 * f, sh = h0 * f;
  const cover = Math.max(cw / (sw * ca + sh * sa), ch / (sw * sa + sh * ca));
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(A);
  ctx.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1);
  ctx.drawImage(img, (-sw * cover) / 2, (-sh * cover) / 2, sw * cover, sh * cover);
  ctx.restore();
  ctx.filter = "none";
  applyTone(ctx, cw, ch, toneMatrix(ops));
  drawVignette(ctx, cw, ch, ops.vignette);
}

/** Unsharp-mask sharpening, bake-time only (full-res, not for live previews). */
export function unsharp(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return;
  const w = canvas.width, h = canvas.height;
  if (w * h > 12_000_000) return; // guard absurd sizes
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const blurC = document.createElement("canvas");
  blurC.width = w;
  blurC.height = h;
  const bctx = blurC.getContext("2d");
  if (!bctx) return;
  bctx.filter = "blur(1.5px)";
  bctx.drawImage(canvas, 0, 0);
  const base = ctx.getImageData(0, 0, w, h);
  const blur = bctx.getImageData(0, 0, w, h);
  const d = base.data, s = blur.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp255(d[i] + amount * (d[i] - s[i]));
    d[i + 1] = clamp255(d[i + 1] + amount * (d[i + 1] - s[i + 1]));
    d[i + 2] = clamp255(d[i + 2] + amount * (d[i + 2] - s[i + 2]));
  }
  ctx.putImageData(base, 0, 0);
}

/** Bake the pipeline at full resolution from a rendered revision URL. */
export async function bakeEdit(url: string, ops: EditOps): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("could not load the render to edit"));
    im.src = url;
  });
  const c = document.createElement("canvas");
  drawInto(img, c, ops);
  unsharp(c, (ops.sharpen / 100) * 1.4);
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("could not export the edited image")),
      "image/png",
    ),
  );
}
