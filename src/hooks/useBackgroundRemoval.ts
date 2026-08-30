import { useCallback, useRef, useState } from 'react';

/**
 * Removes the background from vehicle photos entirely in the browser.
 *
 * The segmentation model runs client-side, so there is no per-image cost and nothing is
 * added to the server — which matters here because the API host already carries the OCR
 * worker pool and PDF rendering for document parsing.
 *
 * The trade-off is speed. We use imgly's full-precision "large" model rather than the
 * default "medium" one — fp16 left visible ghosting artifacts around reflective/complex
 * edges like wheels — which costs more time per photo (measured ~35-40s on a desktop
 * browser) and does NOT drop away once the model is cached; the cost is the inference
 * itself, not the one-off download. Budget ~40s per image and warn before a batch: ten
 * photos is several minutes. `progress` drives a live indicator so the wait reads as work
 * rather than a hang.
 *
 * The model + ONNX runtime are served from same-origin (/bg-removal/, populated once by
 * scripts/setup-bg-removal-assets.mjs) rather than imgly's CDN, so this works with no
 * internet access at the point of use — the actual requirement at a dealership lot.
 *
 * The import is dynamic so the model wrapper is only pulled into the bundle when someone
 * actually removes a background, rather than on every page load.
 */

const LOCAL_MODEL_PUBLIC_PATH = `${window.location.origin}/bg-removal/`;

export type BackgroundRemovalProgress = {
  /** 0-1 across the current image, or null when idle. */
  ratio: number | null;
  /** What the model is doing — fetching assets vs. processing. */
  stage: string | null;
};

export type BackgroundRemovalOptions = {
  /**
   * What to place behind the cutout. "studio" (default) draws a light gradient cyclorama
   * with a dark elliptical turntable floor under the vehicle — the look of a marketplace
   * listing photo. A CSS color string flat-fills instead; null keeps the raw transparent PNG.
   */
  backdrop?: 'studio' | string | null;
};

const TRANSPARENT_PNG = 'image/png';
const DEFAULT_BACKDROP = 'studio';

/** Flattens a transparent cutout onto a solid color so it isn't mistaken for a plain photo. */
async function compositeOntoBackground(blob: Blob, color: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available to composite the background');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not render the composited image'))),
      TRANSPARENT_PNG
    );
  });
}

// Only solidly-opaque pixels count as "the vehicle". The model's mask isn't a clean
// silhouette — edges anti-alias, and faint low-alpha noise (a shadow trail under the tires, a
// semi-transparent ghost) would otherwise drag every measurement past the car's real edges.
const OPAQUE_ALPHA = 200;

/**
 * Measures where the vehicle actually sits: its bounding box, plus the lowest opaque pixel in
 * each column. The per-column contour matters because a 3/4 view puts the near and far wheels
 * at very different heights, and the turntable has to span both — anchoring to the single
 * lowest pixel leaves the far end of the car hovering above the disc.
 */
function measureVehicle(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  // Sampling instead of scanning every pixel keeps this fast on large photos.
  const step = Math.max(1, Math.floor(Math.max(width, height) / 400));
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let found = false;
  const columnBottoms: number[] = [];

  for (let x = 0; x < width; x += step) {
    let columnBottom = -1;
    for (let y = 0; y < height; y += step) {
      if (data[(y * width + x) * 4 + 3] > OPAQUE_ALPHA) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        columnBottom = y;
      }
    }
    if (columnBottom >= 0) columnBottoms.push(columnBottom);
  }
  if (!found) return null;

  columnBottoms.sort((a, b) => a - b);
  const percentile = (p: number) =>
    columnBottoms[Math.min(columnBottoms.length - 1, Math.round((columnBottoms.length - 1) * p))];

  return {
    minX, maxX, minY, maxY,
    // The band across which the car meets the ground, trimmed of outliers at either extreme.
    contactTop: percentile(0.2),
    contactBottom: percentile(0.96),
  };
}

/**
 * Drops disconnected specks the segmentation model leaves behind — a phantom wheel floating
 * beside the car, a wisp of sky above the roof. Those are separate blobs from the vehicle, so
 * keeping only components that are a meaningful fraction of the largest one clears them while
 * preserving genuinely large parts (a mirror the mask happened to separate from the body).
 *
 * Returns null when there is nothing to drop, so the caller can skip the re-encode.
 */
async function dropDetachedSpecks(bitmap: ImageBitmap): Promise<ImageBitmap | null> {
  // Label at low resolution: a speck big enough to matter survives the downscale, and this
  // keeps the flood fill cheap on a 4000px photo.
  const mw = 256;
  const mh = Math.max(1, Math.round((bitmap.height / bitmap.width) * mw));
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mw;
  maskCanvas.height = mh;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskCtx) return null;
  maskCtx.drawImage(bitmap, 0, 0, mw, mh);
  const { data } = maskCtx.getImageData(0, 0, mw, mh);

  // Trace connectivity down to barely-visible alpha. The ghosts worth removing are usually
  // faint — a smoke-like wisp at 20% opacity — so a threshold set at "solid" skips them
  // entirely and they survive into the final image untouched.
  const visible = (i: number) => data[i * 4 + 3] > 24;
  const labels = new Int32Array(mw * mh).fill(-1);
  // Score by total alpha rather than pixel count: a wide but faint wisp carries very little
  // mass, while a real part of the vehicle is opaque and carries a lot. Area alone would rate
  // a large translucent smear as significant.
  const masses: number[] = [];
  const stack: number[] = [];

  for (let seed = 0; seed < mw * mh; seed++) {
    if (labels[seed] !== -1 || !visible(seed)) continue;
    const id = masses.length;
    let mass = 0;
    labels[seed] = id;
    stack.push(seed);
    while (stack.length) {
      const p = stack.pop() as number;
      mass += data[p * 4 + 3];
      const x = p % mw;
      const y = (p / mw) | 0;
      const push = (n: number) => {
        if (labels[n] === -1 && visible(n)) { labels[n] = id; stack.push(n); }
      };
      if (x > 0) push(p - 1);
      if (x < mw - 1) push(p + 1);
      if (y > 0) push(p - mw);
      if (y < mh - 1) push(p + mw);
    }
    masses.push(mass);
  }

  if (masses.length < 2) return null;
  const largest = Math.max(...masses);
  const keep = masses.map((mass) => mass >= largest * 0.12);
  if (keep.every(Boolean)) return null;

  // Paint the keep-mask, dilated a couple of pixels so scaling it back up to full resolution
  // can't nibble into the vehicle's own edge.
  const keepMask = maskCtx.createImageData(mw, mh);
  const DILATE = 2;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      let on = false;
      for (let dy = -DILATE; dy <= DILATE && !on; dy++) {
        for (let dx = -DILATE; dx <= DILATE && !on; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
          const label = labels[ny * mw + nx];
          if (label !== -1 && keep[label]) on = true;
        }
      }
      const o = (y * mw + x) * 4;
      keepMask.data[o] = keepMask.data[o + 1] = keepMask.data[o + 2] = 255;
      keepMask.data[o + 3] = on ? 255 : 0;
    }
  }
  maskCtx.putImageData(keepMask, 0, 0);

  const out = document.createElement('canvas');
  out.width = bitmap.width;
  out.height = bitmap.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.drawImage(bitmap, 0, 0);
  outCtx.globalCompositeOperation = 'destination-in';
  outCtx.drawImage(maskCanvas, 0, 0, out.width, out.height);
  return await createImageBitmap(out);
}

/**
 * Composites the cutout onto a light gradient backdrop with a dark elliptical "turntable"
 * floor under the vehicle — the studio look used in marketplace listing photos, rather than
 * a flat color that reads as an obvious cutout.
 */
async function compositeOntoStudioFloor(blob: Blob): Promise<Blob> {
  let bitmap = await createImageBitmap(blob);
  const cleaned = await dropDetachedSpecks(bitmap);
  if (cleaned) {
    bitmap.close();
    bitmap = cleaned;
  }

  const { width, height } = bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available to composite the background');

  // Draw once off-canvas so we can measure where the vehicle actually sits in the frame —
  // photos vary in framing, and a fixed floor position looks wrong on anything off-center.
  ctx.drawImage(bitmap, 0, 0);
  const car = measureVehicle(ctx, width, height);
  ctx.clearRect(0, 0, width, height);

  const carCx = car ? (car.minX + car.maxX) / 2 : width / 2;
  const carWidth = car ? car.maxX - car.minX : width * 0.7;
  const contactTop = car ? car.contactTop : height * 0.78;
  const contactBottom = car ? car.contactBottom : height * 0.85;

  // Soft light-gray cyclorama background.
  const bgGradient = ctx.createRadialGradient(width / 2, height * 0.3, height * 0.1, width / 2, height * 0.3, width * 0.75);
  bgGradient.addColorStop(0, '#f7f7f8');
  bgGradient.addColorStop(1, '#cbcbcd');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Turntable disc. The width is clamped against the frame so the disc can never run off the
  // edges the way a bare multiple of the car's width does when the car nearly fills the shot.
  const floorRx = Math.min(carWidth * 0.6, width * 0.46);
  // Height comes from a plausible viewing angle, but is forced to at least span the contact
  // band, otherwise the wheel furthest from the camera hangs above the disc.
  const halfBand = Math.max(1, (contactBottom - contactTop) / 2);
  const floorRy = Math.min(Math.max(floorRx * 0.17, halfBand * 1.3), floorRx * 0.42);
  // Seat the contact band just above the disc's centre so more turntable shows in front of the
  // vehicle than behind it, which is what the camera would actually see.
  const floorCy = (contactTop + contactBottom) / 2 + floorRy * 0.18;

  // Squash the drawing space so the radial gradient follows the ellipse and fades out at the
  // rim — a hard-edged fill reads as a sticker pasted onto the backdrop.
  ctx.save();
  ctx.translate(carCx, floorCy);
  ctx.scale(1, floorRy / floorRx);
  const floorGradient = ctx.createRadialGradient(0, 0, floorRx * 0.05, 0, 0, floorRx);
  floorGradient.addColorStop(0, 'rgba(38,38,41,1)');
  floorGradient.addColorStop(0.7, 'rgba(22,22,24,1)');
  floorGradient.addColorStop(0.92, 'rgba(18,18,20,0.9)');
  floorGradient.addColorStop(1, 'rgba(18,18,20,0)');
  ctx.beginPath();
  ctx.arc(0, 0, floorRx, 0, Math.PI * 2);
  ctx.fillStyle = floorGradient;
  ctx.fill();
  ctx.restore();

  // Contact shadow hugging the wheels. The blur scales with the image: a fixed pixel radius is
  // invisible on a 2000px photo and overwhelming on a thumbnail.
  ctx.save();
  ctx.filter = `blur(${Math.max(3, Math.round(width * 0.012))}px)`;
  ctx.beginPath();
  ctx.ellipse(carCx, contactBottom - halfBand * 0.35, carWidth * 0.4, Math.max(4, halfBand * 0.6), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not render the composited image'))),
      TRANSPARENT_PNG
    );
  });
}

export function useBackgroundRemoval() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModelWarm, setIsModelWarm] = useState(false);
  const [progress, setProgress] = useState<BackgroundRemovalProgress>({ ratio: null, stage: null });
  // Cache the dynamic import so repeated calls don't re-resolve the module.
  const moduleRef = useRef<typeof import('@imgly/background-removal') | null>(null);

  const removeBackground = useCallback(
    async (input: Blob | string, options: BackgroundRemovalOptions = {}): Promise<Blob> => {
      setIsProcessing(true);
      setProgress({ ratio: 0, stage: isModelWarm ? 'Processing' : 'Loading model' });

      try {
        if (!moduleRef.current) {
          moduleRef.current = await import('@imgly/background-removal');
        }

        const result = await moduleRef.current.removeBackground(input, {
          publicPath: LOCAL_MODEL_PUBLIC_PATH,
          // Canonical name for the full-precision model imgly also calls "large" — that alias
          // resolves at runtime but isn't in the published types, and this matches the key
          // scripts/setup-bg-removal-assets.mjs downloads.
          model: 'isnet',
          output: { format: TRANSPARENT_PNG },
          progress: (key: string, current: number, total: number) => {
            // Keys look like "fetch:/models/..." or "compute:inference"; the prefix is the
            // only part worth showing.
            const stage = key.startsWith('fetch') ? 'Loading model' : 'Removing background';
            setProgress({ ratio: total > 0 ? current / total : null, stage });
          },
        });

        setIsModelWarm(true);
        const backdrop = options.backdrop === undefined ? DEFAULT_BACKDROP : options.backdrop;
        if (!backdrop) return result;
        return backdrop === 'studio' ? await compositeOntoStudioFloor(result) : await compositeOntoBackground(result, backdrop);
      } finally {
        setIsProcessing(false);
        setProgress({ ratio: null, stage: null });
      }
    },
    [isModelWarm]
  );

  /** Convenience wrapper for the common case of showing the result in an <img>. */
  const removeBackgroundToDataUrl = useCallback(
    async (input: Blob | string, options?: BackgroundRemovalOptions): Promise<string> => {
      const blob = await removeBackground(input, options);
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the processed image'));
        reader.readAsDataURL(blob);
      });
    },
    [removeBackground]
  );

  return { removeBackground, removeBackgroundToDataUrl, isProcessing, isModelWarm, progress };
}

/** Turns a data URL (how uploaded previews are held in state) back into a Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}
