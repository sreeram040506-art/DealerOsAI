/**
 * Shrinks a photo in the browser before upload. Phone photos are often 5-10MB, and the
 * server caps each listing photo at 4MB. Photos with transparency (background-removed
 * cut-outs) are kept as WebP so the transparency survives; everything else becomes JPEG.
 */
export async function compressImage(dataUrl: string, maxSide = 1600, quality = 0.82): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const keepAlpha = dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp');
  return canvas.toDataURL(keepAlpha ? 'image/webp' : 'image/jpeg', quality);
}
