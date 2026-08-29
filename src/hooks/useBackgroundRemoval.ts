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

/** Finds the pixel box of the cutout's non-transparent content, so the floor lines up with it. */
function findAlphaBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let found = false;
  const ALPHA_THRESHOLD = 16;
  // Sampling instead of scanning every pixel keeps this fast on large photos.
  const step = Math.max(1, Math.floor(Math.max(width, height) / 400));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return found ? { minX, maxX, minY, maxY } : null;
}

/**
 * Composites the cutout onto a light gradient backdrop with a dark elliptical "turntable"
 * floor under the vehicle — the studio look used in marketplace listing photos, rather than
 * a flat color that reads as an obvious cutout.
 */
async function compositeOntoStudioFloor(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available to composite the background');

  // Draw once off-canvas so we can measure where the vehicle actually sits in the frame —
  // photos vary in framing, and a fixed floor position looks wrong on anything off-center.
  ctx.drawImage(bitmap, 0, 0);
  const bounds = findAlphaBounds(ctx, width, height);
  ctx.clearRect(0, 0, width, height);

  const carCx = bounds ? (bounds.minX + bounds.maxX) / 2 : width / 2;
  const carBottomY = bounds ? bounds.maxY : height * 0.85;
  const carWidth = bounds ? bounds.maxX - bounds.minX : width * 0.7;

  // Soft light-gray cyclorama background.
  const bgGradient = ctx.createRadialGradient(width / 2, height * 0.3, height * 0.1, width / 2, height * 0.3, width * 0.75);
  bgGradient.addColorStop(0, '#f6f6f6');
  bgGradient.addColorStop(1, '#c9c9c9');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Dark elliptical turntable floor, sized and centered off the vehicle's own footprint.
  const floorRx = carWidth * 0.66;
  const floorRy = floorRx * 0.18;
  const floorCy = carBottomY - floorRy * 0.25;

  const floorGradient = ctx.createRadialGradient(carCx, floorCy, floorRy * 0.1, carCx, floorCy, floorRx);
  floorGradient.addColorStop(0, '#3a3a3a');
  floorGradient.addColorStop(0.75, '#131313');
  floorGradient.addColorStop(1, '#050505');

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(carCx, floorCy, floorRx, floorRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = floorGradient;
  ctx.fill();
  ctx.lineWidth = Math.max(1, width * 0.0018);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.stroke();
  ctx.restore();

  // Tight, soft contact shadow directly under the vehicle.
  ctx.save();
  ctx.filter = 'blur(10px)';
  ctx.beginPath();
  ctx.ellipse(carCx, carBottomY - floorRy * 0.1, floorRx * 0.42, floorRy * 0.55, 0, 0, Math.PI * 2);
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
          model: 'large',
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
