import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LEASE_ANGLES } from '@/lib/leaseAngles';
import { compressImage } from '@/lib/imageCompress';
import { LeasePhase, LeasePhoto, useLeaseActions } from '@/hooks/useLeases';
import { toast } from 'sonner';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

interface Props {
  leaseId: string;
  phase: LeasePhase;
  photos: LeasePhoto[];
  disabled?: boolean;
}

export default function LeasePhotoGrid({ leaseId, phase, photos, disabled }: Props) {
  const { uploadPhoto, deletePhoto } = useLeaseActions();
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const onPick = async (angle: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image'); return; }
    setBusy(angle);
    try {
      // Keep resolution high enough that rim scratches stay visible.
      const dataUrl = await compressImage(await readFile(file), 1600, 0.85);
      await uploadPhoto.mutateAsync({ id: leaseId, phase, angle, dataUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
      const el = inputs.current[angle];
      if (el) el.value = '';
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {LEASE_ANGLES.map(({ key, label }) => {
        const photo = photos.find((p) => p.angle === key);
        return (
          <div key={key} className="space-y-1.5">
            <div className="relative aspect-[3/2] rounded-xl border border-dashed border-border bg-muted/30 overflow-hidden">
              {photo ? (
                <>
                  <img src={photo.dataUrl} alt={label} className="w-full h-full object-cover" />
                  {!disabled && (
                    <Button
                      type="button" size="icon" variant="secondary"
                      className="absolute top-1.5 right-1.5 h-7 w-7"
                      aria-label={`Remove ${label} photo`}
                      onClick={() => deletePhoto.mutate({ id: leaseId, photoId: photo.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={disabled || busy === key}
                  onClick={() => inputs.current[key]?.click()}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {busy === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  <span className="text-[11px]">{disabled ? 'No photo' : 'Add photo'}</span>
                </button>
              )}
              <input
                ref={(el) => { inputs.current[key] = el; }}
                type="file" accept="image/*" className="hidden"
                onChange={(e) => onPick(key, e.target.files?.[0])}
              />
            </div>
            <p className="text-xs font-medium">{label}</p>
          </div>
        );
      })}
    </div>
  );
}
