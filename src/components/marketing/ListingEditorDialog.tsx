import { useEffect, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assetUrl } from '@/lib/api';
import { compressImage } from '@/lib/imageCompress';
import type { ListingUpdate, MarketingListing } from '@/hooks/useMarketing';
import { ChannelPicker } from './shared';
import { readFileAsDataUrl } from './marketingUtils';

type Props = {
  listing: MarketingListing | null;
  channels: string[];
  conditions: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (changes: ListingUpdate & { id: string }) => Promise<unknown>;
  saving: boolean;
};

export default function ListingEditorDialog({ listing, channels, conditions, onOpenChange, onSave, saving }: Props) {
  const [form, setForm] = useState({
    seoTitle: '',
    description: '',
    adCopy: '',
    featureBullets: '',
    hashtags: '',
    pricing: '',
    mileage: '',
    condition: '',
  });
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    if (!listing) return;
    setForm({
      seoTitle: listing.seoTitle,
      description: listing.description,
      adCopy: listing.adCopy,
      featureBullets: listing.featureBullets.join('\n'),
      hashtags: listing.hashtags.join(' '),
      pricing: String(listing.pricing),
      mileage: String(listing.mileage),
      condition: listing.condition,
    });
    setSelectedChannels(listing.channels);
    setRemoved([]);
    setAdded([]);
  }, [listing]);

  if (!listing) return null;

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    try {
      const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
      const compressed = await Promise.all(images.map(async (f) => compressImage(await readFileAsDataUrl(f))));
      setAdded((prev) => [...prev, ...compressed]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add photos');
    }
  };

  const save = async () => {
    try {
      await onSave({
        id: listing.id,
        seoTitle: form.seoTitle,
        description: form.description,
        adCopy: form.adCopy,
        featureBullets: form.featureBullets.split('\n').map((s) => s.trim()).filter(Boolean),
        hashtags: form.hashtags.split(/\s+/).map((s) => s.trim()).filter(Boolean),
        pricing: Number(form.pricing),
        mileage: Number(form.mileage),
        condition: form.condition,
        channels: selectedChannels,
        ...(removed.length ? { removePhotos: removed } : {}),
        ...(added.length ? { addPhotos: added } : {}),
      });
      toast.success('Listing saved');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the listing');
    }
  };

  const keptPhotos = listing.photos
    .map((ref, i) => ({ ref, url: assetUrl(listing.photoUrls[i]) }))
    .filter((p) => !removed.includes(p.ref));

  return (
    <Dialog open={Boolean(listing)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit listing — {listing.vehicleSpecs}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {listing.copySource === 'TEMPLATE' && (
            <p className="text-xs text-muted-foreground">
              This text was built from a template (no AI key is configured). Review it before publishing.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Asking price ($)</Label>
              <Input type="number" min="1" value={form.pricing} onChange={(e) => setForm({ ...form, pricing: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Mileage</Label>
              <Input type="number" min="0" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                <SelectTrigger><SelectValue placeholder="Condition" /></SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Short ad copy</Label>
            <Textarea rows={2} value={form.adCopy} onChange={(e) => setForm({ ...form, adCopy: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Highlights (one per line)</Label>
              <Textarea rows={4} value={form.featureBullets} onChange={(e) => setForm({ ...form, featureBullets: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Hashtags (space-separated)</Label>
              <Textarea rows={4} value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Channels</Label>
            <ChannelPicker channels={channels} selected={selectedChannels} onChange={setSelectedChannels} />
          </div>

          <div className="space-y-2">
            <Label>Photos</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {keptPhotos.map((p) => (
                <div key={p.ref} className="relative group">
                  <img src={p.url} alt="" className="h-20 w-full rounded-md border border-border object-cover bg-muted" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setRemoved((prev) => [...prev, p.ref])}
                    className="absolute top-1 right-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {added.map((src, i) => (
                <div key={`new-${i}`} className="relative">
                  <img src={src} alt="" className="h-20 w-full rounded-md border border-primary/40 object-cover bg-muted" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setAdded((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-20 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary/50">
                <Upload className="mb-1 h-4 w-4" />
                Add
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || selectedChannels.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
