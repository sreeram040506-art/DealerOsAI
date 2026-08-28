import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Upload, X, Scissors, Undo2, Loader2, Download, ImageDown } from 'lucide-react';
import { useBackgroundRemoval, dataUrlToBlob } from '@/hooks/useBackgroundRemoval';
import { toast } from 'sonner';

export default function PhotoStudio() {
  const [images, setImages] = useState<string[]>([]);
  // Pre-cutout versions, keyed by index, so a background removal can be undone.
  const [originalImages, setOriginalImages] = useState<Record<number, string>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { removeBackgroundToDataUrl, isProcessing, progress } = useBackgroundRemoval();

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please select image files only');
      return;
    }

    const dataUrls: string[] = [];
    for (const file of imageFiles) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        dataUrls.push(dataUrl);
      } catch {
        toast.error(`Failed to read ${file.name}`);
      }
    }

    setImages((prev) => [...prev, ...dataUrls]);
    toast.success(`${dataUrls.length} photo(s) added`);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setOriginalImages((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleRemoveBackground = async (index: number) => {
    const source = images[index];
    if (!source) return;
    setActiveIndex(index);
    try {
      const cutout = await removeBackgroundToDataUrl(await dataUrlToBlob(source));
      setOriginalImages((prev) => ({ ...prev, [index]: source }));
      setImages((prev) => prev.map((img, i) => (i === index ? cutout : img)));
      toast.success('Background removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the background');
    } finally {
      setActiveIndex(null);
    }
  };

  const handleRestoreOriginal = (index: number) => {
    const original = originalImages[index];
    if (!original) return;
    setImages((prev) => prev.map((img, i) => (i === index ? original : img)));
    setOriginalImages((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleRemoveAllBackgrounds = async () => {
    for (let i = 0; i < images.length; i++) {
      if (originalImages[i]) continue; // already cut out
      await handleRemoveBackground(i);
    }
  };

  const handleDownload = (index: number) => {
    const link = document.createElement('a');
    link.href = images[index];
    link.download = `photo-${index + 1}${originalImages[index] ? '-no-bg' : ''}.png`;
    link.click();
  };

  const handleDownloadAll = () => {
    images.forEach((_, index) => handleDownload(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Photo Studio</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Cut vehicle photo backgrounds and download the result — runs entirely in your browser, no upload, works offline.
          </p>
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('photo-studio-upload')?.click()}
        >
          <input
            id="photo-studio-upload"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {isDragging ? 'Drop photos here' : 'Click to upload or drag & drop photos'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 10MB each</p>
        </div>

        {images.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={isProcessing} onClick={handleRemoveAllBackgrounds}>
                  {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scissors className="w-4 h-4 mr-2" />}
                  Remove background on all
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadAll}>
                  <ImageDown className="w-4 h-4 mr-2" />
                  Download all
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {isProcessing
                  ? `${progress.stage ?? 'Working'}${progress.ratio !== null ? ` — ${Math.round(progress.ratio * 100)}%` : ''}${
                      activeIndex !== null ? ` (photo ${activeIndex + 1} of ${images.length})` : ''
                    }`
                  : `Runs in your browser — photos are never uploaded for this. Around 20 seconds per photo${
                      images.length > 1 ? `, so roughly ${Math.ceil((images.length * 20) / 60)} min for all ${images.length}` : ''
                    }.`}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {images.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={image}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-28 object-cover rounded-lg border border-border bg-black"
                  />

                  {activeIndex === index && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    </div>
                  )}

                  <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {originalImages[index] ? (
                      <button
                        type="button"
                        title="Restore the original photo"
                        onClick={(e) => { e.stopPropagation(); handleRestoreOriginal(index); }}
                        className="p-1 rounded bg-background/90 border border-border text-foreground hover:bg-background"
                      >
                        <Undo2 className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Remove background"
                        disabled={isProcessing}
                        onClick={(e) => { e.stopPropagation(); handleRemoveBackground(index); }}
                        className="p-1 rounded bg-background/90 border border-border text-foreground hover:bg-background disabled:opacity-50"
                      >
                        <Scissors className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Download"
                      onClick={(e) => { e.stopPropagation(); handleDownload(index); }}
                      className="p-1 rounded bg-background/90 border border-border text-foreground hover:bg-background"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    title="Remove photo"
                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(index); }}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
