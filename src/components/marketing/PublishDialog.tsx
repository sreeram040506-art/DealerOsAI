import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { MarketingListing } from '@/hooks/useMarketing';
import { ChannelPicker, Pill } from './shared';
import { CHANNEL_STATUS, copyText, listingPostText } from './marketingUtils';

type Props = {
  listing: MarketingListing | null;
  channels: string[];
  onOpenChange: (open: boolean) => void;
  onPublish: (args: { id: string; channels: string[]; scheduleAt?: string }) => Promise<MarketingListing>;
  publishing: boolean;
};

const trackingLink = (listing: MarketingListing, channel: string) =>
  `${window.location.origin}${listing.publicPath}?src=${encodeURIComponent(channel)}`;

export default function PublishDialog({ listing, channels, onOpenChange, onPublish, publishing }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [when, setWhen] = useState('');
  const [current, setCurrent] = useState<MarketingListing | null>(null);

  useEffect(() => {
    setCurrent(listing);
    if (!listing) return;
    setSelected(listing.channels);
    setMode('now');
    setWhen('');
  }, [listing]);

  if (!listing || !current) return null;

  const results = current.status === 'PUBLISHED' && Array.isArray(current.scheduledPosts) ? current.scheduledPosts : [];

  const submit = async () => {
    if (mode === 'later' && !when) {
      toast.error('Choose when to publish');
      return;
    }
    try {
      const updated = await onPublish({
        id: listing.id,
        channels: selected,
        ...(mode === 'later' ? { scheduleAt: new Date(when).toISOString() } : {}),
      });
      setCurrent(updated);
      if (updated.status === 'SCHEDULED') {
        toast.success(`Scheduled for ${new Date(updated.scheduledFor!).toLocaleString()}`);
        onOpenChange(false);
      } else {
        const posted = (updated.scheduledPosts || []).filter((r) => r.status === 'POSTED').length;
        toast.success(`Published. Live on ${posted} channel${posted === 1 ? '' : 's'}; see below for the rest.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish');
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await copyText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  return (
    <Dialog open={Boolean(listing)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{results.length ? 'Channel status' : 'Publish listing'} — {listing.vehicleSpecs}</DialogTitle>
        </DialogHeader>

        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Channels marked "Post manually" have no integration yet. Copy the text and post it yourself; the tracking
              link credits views and inquiries to that channel.
            </p>
            <div className="divide-y divide-border rounded-lg border border-border">
              {results.map((r) => {
                const link = r.permalink || r.trackingUrl || trackingLink(current, r.channel);
                return (
                  <div key={r.channel} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{r.channel}</span>
                        <Pill className={CHANNEL_STATUS[r.status]?.style ?? ''}>{CHANNEL_STATUS[r.status]?.label ?? r.status}</Pill>
                      </div>
                      {(r.error || r.note) && <p className="mt-1 text-xs text-muted-foreground">{r.error || r.note}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => copy(link, 'Link')}>
                        <Copy className="mr-1 h-3 w-3" /> Link
                      </Button>
                      {r.status !== 'POSTED' && (
                        <Button size="sm" variant="outline" onClick={() => copy(listingPostText(current, trackingLink(current, r.channel)), 'Post text')}>
                          <Copy className="mr-1 h-3 w-3" /> Post text
                        </Button>
                      )}
                      {r.status === 'POSTED' && link.startsWith('http') && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{results.length ? 'Publish again to' : 'Channels'}</Label>
            <ChannelPicker channels={channels} selected={selected} onChange={setSelected} />
          </div>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'now' | 'later')} className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="now" /> Publish now
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="later" /> Schedule
            </label>
          </RadioGroup>
          {mode === 'later' && (
            <Input
              type="datetime-local"
              value={when}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => setWhen(e.target.value)}
              className="max-w-xs"
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={publishing || selected.length === 0}>
            {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'later' ? 'Schedule' : results.length ? 'Publish again' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
