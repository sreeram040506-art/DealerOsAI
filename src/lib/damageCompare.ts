/**
 * Before/after photo comparison for leased vehicles.
 *
 * Both photos are shrunk to the same grid, brightness-normalised (so a cloudier return day
 * doesn't flag the whole car), aligned with a small search (so the photographer standing a
 * step to the left doesn't either), then compared on both brightness and edge strength —
 * scratches, dents and curb-rashed rims show up as edge/shading changes. Changed pixels are
 * grouped into regions the UI draws as boxes over the return photo.
 *
 * This is a screening aid, not a verdict: it points a person at where to look.
 */

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array; // 0..255
}

export interface DamageRegion {
  /** Fractions of the image (0..1), so the UI can overlay at any size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 — how strongly the area differs. */
  score: number;
  severity: 'minor' | 'moderate' | 'major';
}

export interface ComparisonResult {
  regions: DamageRegion[];
  /** Share of the image that changed, 0..1. */
  changedRatio: number;
  /** False when the two photos are too different overall (angle/lighting) to trust the result. */
  reliable: boolean;
  warning?: string;
}

export const COMPARE_WIDTH = 240;
export const COMPARE_HEIGHT = 160;

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return { width, height, data };
}

function normalise(img: GrayImage): Float32Array {
  const { data } = img;
  let mean = 0;
  for (let i = 0; i < data.length; i++) mean += data[i];
  mean /= data.length;
  let variance = 0;
  for (let i = 0; i < data.length; i++) variance += (data[i] - mean) ** 2;
  const std = Math.sqrt(variance / data.length) || 1;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = ((data[i] - mean) / std) * 50 + 128;
  return out;
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = sum / size;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = sum / size;
    }
  }
  return out;
}

function gradient(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = src[y * w + x + 1] - src[y * w + x - 1];
      const gy = src[(y + 1) * w + x] - src[(y - 1) * w + x];
      out[y * w + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** Lowest difference between a[x,y] and any pixel within ±r of b[x,y]: forgives small shifts. */
function tolerantDiff(a: Float32Array, b: Float32Array, w: number, h: number, dx: number, dy: number, r: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bx = x + dx;
      const by = y + dy;
      let best = Infinity;
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const px = bx + ox;
          const py = by + oy;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const d = Math.abs(a[y * w + x] - b[py * w + px]);
          if (d < best) best = d;
        }
      }
      out[y * w + x] = best === Infinity ? 0 : best;
    }
  }
  return out;
}

function findAlignment(a: Float32Array, b: Float32Array, w: number, h: number, maxShift: number) {
  let best = { dx: 0, dy: 0, cost: Infinity };
  const step = 2;
  for (let dy = -maxShift; dy <= maxShift; dy += step) {
    for (let dx = -maxShift; dx <= maxShift; dx += step) {
      let cost = 0;
      let n = 0;
      for (let y = 4; y < h - 4; y += 3) {
        for (let x = 4; x < w - 4; x += 3) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          cost += Math.abs(a[y * w + x] - b[py * w + px]);
          n++;
        }
      }
      if (n && cost / n < best.cost) best = { dx, dy, cost: cost / n };
    }
  }
  return best;
}

const CELL = 8;

export function compareImages(before: GrayImage, after: GrayImage): ComparisonResult {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('Images must be the same size');
  }
  const { width: w, height: h } = before;

  const blurA = boxBlur(normalise(before), w, h, 1);
  const blurB = boxBlur(normalise(after), w, h, 1);
  const { dx, dy, cost } = findAlignment(blurA, blurB, w, h, 10);

  const lum = tolerantDiff(blurA, blurB, w, h, dx, dy, 1);
  const gradA = gradient(blurA, w, h);
  const gradB = gradient(blurB, w, h);
  const edge = tolerantDiff(gradA, gradB, w, h, dx, dy, 1);

  // Combined per-pixel change signal.
  const diff = new Float32Array(w * h);
  for (let i = 0; i < diff.length; i++) diff[i] = Math.max(lum[i] / 40, edge[i] / 22);

  // Roll up into cells; a cell is "changed" when enough of its pixels exceed the threshold.
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const cellScore = new Float32Array(cols * rows);
  let changedCells = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let over = 0;
      let total = 0;
      let peak = 0;
      for (let y = cy * CELL; y < Math.min(h, (cy + 1) * CELL); y++) {
        for (let x = cx * CELL; x < Math.min(w, (cx + 1) * CELL); x++) {
          const d = diff[y * w + x];
          if (d > 1) over++;
          peak = Math.max(peak, d);
          total++;
        }
      }
      const frac = over / total;
      if (frac > 0.2) {
        cellScore[cy * cols + cx] = Math.min(1, frac * 0.7 + Math.min(peak, 3) / 10);
        changedCells++;
      }
    }
  }

  // Connected components over changed cells (8-neighbour).
  const seen = new Uint8Array(cols * rows);
  const regions: DamageRegion[] = [];
  for (let start = 0; start < cellScore.length; start++) {
    if (!cellScore[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let minX = cols, minY = rows, maxX = 0, maxY = 0, count = 0, scoreSum = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      const cx = idx % cols;
      const cy = Math.floor(idx / cols);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      count++;
      scoreSum += cellScore[idx];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (cellScore[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    // A lone flagged cell is usually noise (reflection, dust); real marks span a couple.
    if (count < 2) continue;
    const score = Math.min(1, (scoreSum / count) * 0.6 + Math.min(count, 20) / 40);
    regions.push({
      x: (minX * CELL) / w,
      y: (minY * CELL) / h,
      w: ((maxX - minX + 1) * CELL) / w,
      h: ((maxY - minY + 1) * CELL) / h,
      score,
      severity: score > 0.65 ? 'major' : score > 0.4 ? 'moderate' : 'minor',
    });
  }
  regions.sort((a, b) => b.score - a.score);

  const changedRatio = changedCells / (cols * rows);
  // Huge residual after alignment, or most of the frame flagged: the shots don't match up.
  const reliable = cost < 40 && changedRatio < 0.45;
  return {
    regions: reliable ? regions : regions.slice(0, 8),
    changedRatio,
    reliable,
    warning: reliable
      ? undefined
      : 'These two photos look too different (angle, distance or lighting), so results may be unreliable. Retake the return photo from the same position.',
  };
}

/** Browser-only: decode a data URL and rasterise it to the shared comparison grid. */
export async function loadGray(dataUrl: string): Promise<GrayImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read photo'));
    el.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = COMPARE_WIDTH;
  canvas.height = COMPARE_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, COMPARE_WIDTH, COMPARE_HEIGHT);
  const { data } = ctx.getImageData(0, 0, COMPARE_WIDTH, COMPARE_HEIGHT);
  return toGray(data, COMPARE_WIDTH, COMPARE_HEIGHT);
}

export async function comparePhotos(beforeUrl: string, afterUrl: string): Promise<ComparisonResult> {
  const [a, b] = await Promise.all([loadGray(beforeUrl), loadGray(afterUrl)]);
  return compareImages(a, b);
}
