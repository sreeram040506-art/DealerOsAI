import { useCallback, useRef, useState } from 'react';

/**
 * Removes the background from vehicle photos entirely in the browser.
 *
 * The segmentation model runs client-side, so there is no per-image cost and nothing is
 * added to the server — which matters here because the API host already carries the OCR
 * worker pool and PDF rendering for document parsing.
 *
 * The trade-off is speed. Measured on a desktop browser, a single photo takes roughly
 * 20 seconds, and that does NOT drop away once the model is cached — the cost is the
 * inference itself, not the one-off ~40MB download. Budget about 20s per image and warn
 * before a batch: ten photos is several minutes. `progress` drives a live indicator so the
 * wait reads as work rather than a hang.
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
   * Solid color painted behind the cutout, e.g. "#000000". Pass null to keep the raw
   * transparent PNG. Defaults to black — a plain transparent PNG renders as white in most
   * viewers/editors downstream, which looks like the removal silently did nothing.
   */
  backgroundColor?: string | null;
};

const TRANSPARENT_PNG = 'image/png';
const DEFAULT_BACKGROUND_COLOR = '#000000';

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
          output: { format: TRANSPARENT_PNG },
          progress: (key: string, current: number, total: number) => {
            // Keys look like "fetch:/models/..." or "compute:inference"; the prefix is the
            // only part worth showing.
            const stage = key.startsWith('fetch') ? 'Loading model' : 'Removing background';
            setProgress({ ratio: total > 0 ? current / total : null, stage });
          },
        });

        setIsModelWarm(true);
        const backgroundColor = options.backgroundColor === undefined ? DEFAULT_BACKGROUND_COLOR : options.backgroundColor;
        return backgroundColor ? await compositeOntoBackground(result, backgroundColor) : result;
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
