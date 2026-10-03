import { useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, Copy, Eye, Loader2, Megaphone, MessageSquare, Pencil, Scissors,
  Search, Send, Sparkles, Trash2, Undo2, Upload, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import AddAdvertisingDialog from '@/components/AddAdvertisingDialog';
import ListingEditorDialog from '@/components/marketing/ListingEditorDialog';
import PublishDialog from '@/components/marketing/PublishDialog';
import LeadsDialog from '@/components/marketing/LeadsDialog';
import { ChannelPicker, Pill } from '@/components/marketing/shared';
import { CHANNEL_STATUS, LISTING_STATUS_STYLE, copyText, readFileAsDataUrl } from '@/components/marketing/marketingUtils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBackgroundRemoval, dataUrlToBlob } from '@/hooks/useBackgroundRemoval';
import { useMarketing, type MarketingListing } from '@/hooks/useMarketing';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useAuth } from '@/context/auth-hooks';
import { assetUrl } from '@/lib/api';
import { compressImage } from '@/lib/imageCompress';
import { formatCurrency } from '@/lib/utils';
import type { AdvertisingExpense } from '@/types/inventory';

interface AdvertisingProps {
  isSubpage?: boolean;
}

const EMPTY_FORM = { vehicleId: '', vin: '', vehicleSpecs: '', mileage: '', condition: '', pricing: '' };

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat-card">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Advertising({ isSubpage = false }: AdvertisingProps) {
  const marketing = useMarketing();
  const { listings, summary, options, leads } = marketing;
  const { ads, isLoading: adsLoading, isError: adsError, deleteAd } = useAdvertising();
  const { vehicles } = useInventory();
  const { user } = useAuth();
  // Campaign spend is admin-managed (the API rejects changes from other roles).
  const canManageCampaigns = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const channels = options?.channels ?? [];
  const conditions = options?.conditions ?? [];

  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formChannels, setFormChannels] = useState<string[] | null>(null);
  const selectedChannels = formChannels ?? channels;

  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  // Pre-cutout versions, keyed by index, so a background removal can be undone.
  const [originalImages, setOriginalImages] = useState<Record<number, string>>({});
  const [activeBgIndex, setActiveBgIndex] = useState<number | null>(null);
  const { removeBackgroundToDataUrl, isProcessing: isRemovingBg, progress: bgProgress } = useBackgroundRemoval();
  const [isDragging, setIsDragging] = useState(false);

  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<AdvertisingExpense | null>(null);
  const [adToDelete, setAdToDelete] = useState<AdvertisingExpense | null>(null);
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketingListing | null>(null);
  const [publishingListing, setPublishingListing] = useState<MarketingListing | null>(null);
  const [listingToDelete, setListingToDelete] = useState<MarketingListing | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const forSale = useMemo(() => vehicles.filter((v) => v.status !== 'Sold'), [vehicles]);
  const term = searchTerm.trim().toLowerCase();

  const filteredAds = useMemo(
    () => ads.filter((ad) => `${ad.campaignName} ${ad.platform}`.toLowerCase().includes(term)),
    [ads, term],
  );
  const filteredListings = useMemo(
    () => listings
      .filter((row) => showArchived || row.status !== 'ARCHIVED')
      .filter((row) => `${row.vin} ${row.vehicleSpecs} ${row.seoTitle}`.toLowerCase().includes(term)),
    [listings, term, showArchived],
  );
  const campaignResults = useMemo(
    () => new Map((summary?.campaigns ?? []).map((c) => [c.id, c])),
    [summary],
  );
  const newLeads = leads.filter((l) => l.status === 'NEW').length;

  // ── Photos ─────────────────────────────────────────────────────────────────────────────

  const handleImageUpload = async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please select image files only');
      return;
    }
    const added: string[] = [];
    for (const file of imageFiles) {
      try {
        added.push(await compressImage(await readFileAsDataUrl(file)));
      } catch {
        toast.error(`Failed to process ${file.name}`);
      }
    }
    setUploadedImages((prev) => [...prev, ...added]);
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    setOriginalImages((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      }
      return next;
    });
  };

  // Cuts the background out of one photo, leaving a transparent image. The original is kept
  // so the operator can undo a result they don't like without re-uploading.
  const handleRemoveBackground = async (index: number) => {
    const source = uploadedImages[index];
    if (!source) return;
    setActiveBgIndex(index);
    try {
      const cutout = await compressImage(await removeBackgroundToDataUrl(await dataUrlToBlob(source)));
      setOriginalImages((prev) => ({ ...prev, [index]: source }));
      setUploadedImages((prev) => prev.map((img, i) => (i === index ? cutout : img)));
      toast.success('Background removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the background');
    } finally {
      setActiveBgIndex(null);
    }
  };

  const handleRestoreOriginal = (index: number) => {
    const original = originalImages[index];
    if (!original) return;
    setUploadedImages((prev) => prev.map((img, i) => (i === index ? original : img)));
    setOriginalImages((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleRemoveAllBackgrounds = async () => {
    for (let i = 0; i < uploadedImages.length; i++) {
      if (originalImages[i]) continue;
      await handleRemoveBackground(i);
    }
  };

  // ── Listing builder ────────────────────────────────────────────────────────────────────

  const selectVehicle = (id: string) => {
    if (id === 'none') {
      setForm(EMPTY_FORM);
      return;
    }
    const v = forSale.find((veh) => veh.id === id);
    if (!v) return;
    setForm({
      vehicleId: v.id,
      vin: v.vin || '',
      vehicleSpecs: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
      mileage: v.mileage !== undefined ? String(v.mileage) : '',
      condition: '',
      // The advertised price, never the purchase cost.
      pricing: v.askingPrice ? String(v.askingPrice) : '',
    });
  };

  const missing = [
    !form.vin.trim() && 'VIN',
    !form.vehicleSpecs.trim() && 'vehicle',
    form.mileage === '' && 'mileage',
    !form.condition && 'condition',
    !(Number(form.pricing) > 0) && 'asking price',
    selectedChannels.length === 0 && 'a channel',
  ].filter(Boolean) as string[];

  const handleGenerate = async () => {
    if (missing.length) {
      toast.error(`Add ${missing.join(', ')}`);
      return;
    }
    try {
      const created = await marketing.generateListing({
        vehicleId: form.vehicleId || undefined,
        vin: form.vin,
        vehicleSpecs: form.vehicleSpecs,
        photos: uploadedImages,
        mileage: Number(form.mileage),
        condition: form.condition,
        pricing: Number(form.pricing),
        channels: selectedChannels,
      });
      toast.success('Draft created. Review the text, then publish.');
      setForm(EMPTY_FORM);
      setFormChannels(null);
      setUploadedImages([]);
      setOriginalImages({});
      setEditingListing(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create the listing');
    }
  };

  // ── Listing actions ────────────────────────────────────────────────────────────────────

  const archive = async (listing: MarketingListing) => {
    try {
      await marketing.archiveListing(listing.id);
      toast.success('Listing archived');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not archive');
    }
  };

  const confirmDeleteListing = async () => {
    if (!listingToDelete) return;
    try {
      await marketing.deleteListing(listingToDelete.id);
      toast.success('Listing deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setListingToDelete(null);
    }
  };

  const confirmDeleteAd = async () => {
    if (!adToDelete) return;
    try {
      await deleteAd(adToDelete.id);
      toast.success('Campaign deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setAdToDelete(null);
    }
  };

  const copyPublicLink = async (listing: MarketingListing) => {
    try {
      await copyText(`${window.location.origin}${listing.publicPath}`);
      toast.success('Public link copied');
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  const wrap = (node: React.ReactNode) => (isSubpage ? <>{node}</> : <AppLayout>{node}</AppLayout>);

  if (marketing.isLoading || adsLoading) {
    return wrap(
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading marketing…
      </div>,
    );
  }
  if (marketing.isError || adsError) {
    return wrap(<QueryErrorState title="Could not load marketing data" description="The data request failed." />);
  }

  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatCurrency(n));

  const content = (
    <div className="space-y-8">
      {!isSubpage && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Marketing</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">Create listings, publish them to channels, and track the leads they bring in.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campaigns and listings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-border bg-muted/50 pl-10"
            />
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Live listings"
          value={String(summary?.listings.published ?? 0)}
          hint={`${summary?.listings.scheduled ?? 0} scheduled · ${summary?.listings.drafts ?? 0} drafts`}
        />
        <StatTile label="Leads this week" value={String(summary?.leads.thisWeek ?? 0)} hint={`${summary?.leads.total ?? 0} total · ${newLeads} not yet contacted`} />
        <StatTile label="Ad spend" value={fmt(summary?.spend.total ?? 0)} hint={`${fmt(summary?.spend.active ?? 0)} on active campaigns`} />
        <StatTile label="Spend per lead" value={fmt(summary?.costPerLead)} hint="All ad spend ÷ all leads" />
      </div>

      {/* Campaigns */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Ad campaigns</h2>
          <div className="flex gap-2">
            <Button onClick={() => setLeadsOpen(true)} variant="outline" className="h-10">
              <Users className="mr-2 h-4 w-4" /> Leads{newLeads > 0 ? ` (${newLeads} new)` : ''}
            </Button>
            {canManageCampaigns && (
              <Button onClick={() => { setEditingAd(null); setCampaignDialogOpen(true); }} className="h-10">
                <Megaphone className="mr-2 h-4 w-4" /> Add campaign
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  <th className="px-6 py-4">Campaign</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Spend vs budget</th>
                  <th className="px-6 py-4">Leads</th>
                  <th className="px-6 py-4">Cost / lead</th>
                  <th className="px-6 py-4">Result</th>
                  {canManageCampaigns && <th className="px-6 py-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAds.map((ad) => {
                  const isOverBudget = Boolean(ad.budgetLimit && ad.amountSpent >= ad.budgetLimit);
                  const result = campaignResults.get(ad.id);
                  return (
                    <tr key={ad.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${isOverBudget ? 'bg-destructive/10' : ''}`}>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2 font-bold">
                          {isOverBudget && <AlertTriangle className="h-4 w-4 text-destructive" />}
                          {ad.campaignName}
                        </div>
                        <div className="text-xs text-muted-foreground">{ad.platform}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Pill className={
                          (ad.status || 'Active') === 'Active' ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                            : ad.status === 'Paused' ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                            : 'bg-muted text-muted-foreground'
                        }>
                          {ad.status || 'Active'}
                        </Pill>
                      </td>
                      <td className={`px-6 py-4 text-sm tabular-nums ${isOverBudget ? 'font-bold text-destructive' : ''}`}>
                        {formatCurrency(ad.amountSpent)} {ad.budgetLimit ? `/ ${formatCurrency(ad.budgetLimit)}` : ''}
                      </td>
                      {result?.attributable ? (
                        <>
                          <td className="px-6 py-4 text-sm tabular-nums">{result.leads}</td>
                          <td className="px-6 py-4 text-sm tabular-nums">{fmt(result.costPerLead)}</td>
                          <td className="px-6 py-4 text-sm">
                            {result.sold
                              ? <>Sold {fmt(result.saleRevenue)}{result.returnOnAdSpend ? <span className="text-muted-foreground"> · {result.returnOnAdSpend.toFixed(1)}× spend</span> : null}</>
                              : <span className="text-muted-foreground">Not sold yet</span>}
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-6 py-4 text-xs text-muted-foreground">
                          Link a vehicle to this campaign to track its leads and sale.
                        </td>
                      )}
                      {canManageCampaigns && (
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => { setEditingAd(ad); setCampaignDialogOpen(true); }}>Edit</Button>
                          <Button variant="ghost" size="sm" className="text-destructive" aria-label="Delete campaign" onClick={() => setAdToDelete(ad)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredAds.length === 0 && (
                  <tr>
                    <td colSpan={canManageCampaigns ? 7 : 6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      {ads.length ? 'No campaigns match your search.' : 'No ad campaigns yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Listing builder */}
      <section className="stat-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">New listing</h2>
          <p className="text-xs text-muted-foreground">Creates a draft you can review and edit before anything is published.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1 md:col-span-3">
            <Label>Inventory vehicle</Label>
            <Select value={form.vehicleId || 'none'} onValueChange={selectVehicle}>
              <SelectTrigger><SelectValue placeholder="Select a vehicle (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not in inventory — enter details below</SelectItem>
                {forSale.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{[v.year, v.make, v.model, v.vin].filter(Boolean).join(' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>VIN</Label>
            <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Vehicle (year make model trim)</Label>
            <Input value={form.vehicleSpecs} onChange={(e) => setForm({ ...form, vehicleSpecs: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Mileage</Label>
            <Input type="number" min="0" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Condition</Label>
            <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
              <SelectTrigger><SelectValue placeholder="Choose condition" /></SelectTrigger>
              <SelectContent>
                {conditions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Asking price ($)</Label>
            <Input type="number" min="1" placeholder="Advertised price" value={form.pricing} onChange={(e) => setForm({ ...form, pricing: e.target.value })} />
            {form.vehicleId && !form.pricing && (
              <p className="text-[11px] text-muted-foreground">This vehicle has no asking price yet; the one you enter is saved to it.</p>
            )}
          </div>
        </div>

        {/* Photos */}
        <div className="space-y-3">
          <div
            className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleImageUpload(e.dataTransfer.files); }}
            onClick={() => document.getElementById('image-upload-input')?.click()}
          >
            <input id="image-upload-input" type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e.target.files)} />
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{isDragging ? 'Drop photos here' : 'Click to upload or drag & drop photos'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Photos are resized in your browser before upload.</p>
          </div>

          {uploadedImages.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" disabled={isRemovingBg} onClick={handleRemoveAllBackgrounds}>
                  {isRemovingBg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />}
                  Remove background on all
                </Button>
                <p className="text-xs text-muted-foreground">
                  {isRemovingBg
                    ? `${bgProgress.stage ?? 'Working'}${bgProgress.ratio !== null ? ` — ${Math.round(bgProgress.ratio * 100)}%` : ''}${activeBgIndex !== null ? ` (photo ${activeBgIndex + 1} of ${uploadedImages.length})` : ''}`
                    : 'Runs in your browser. Around 40 seconds per photo.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="group relative">
                    <img src={image} alt={`Upload ${index + 1}`} className="h-24 w-full rounded-lg border border-border bg-muted object-cover" />
                    {activeBgIndex === index && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {originalImages[index] ? (
                        <button type="button" title="Restore the original photo" onClick={() => handleRestoreOriginal(index)} className="rounded border border-border bg-background/90 p-1">
                          <Undo2 className="h-3 w-3" />
                        </button>
                      ) : (
                        <button type="button" title="Remove background" disabled={isRemovingBg} onClick={() => handleRemoveBackground(index)} className="rounded border border-border bg-background/90 p-1 disabled:opacity-50">
                          <Scissors className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <button type="button" aria-label="Remove photo" onClick={() => handleRemoveImage(index)} className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Channels</Label>
          <ChannelPicker channels={channels} selected={selectedChannels} onChange={setFormChannels} />
        </div>

        <Button onClick={handleGenerate} disabled={marketing.isGenerating}>
          {marketing.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {marketing.isGenerating ? 'Writing listing…' : 'Create draft'}
        </Button>
      </section>

      {/* Listings */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Listings</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  <th className="px-6 py-4">Listing</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Channels</th>
                  <th className="px-6 py-4">Results</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((row) => {
                  const posts = Array.isArray(row.scheduledPosts) ? row.scheduledPosts : [];
                  const thumb = row.photoUrls?.[0];
                  return (
                    <tr key={row.id} className="border-b border-border align-top last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="flex gap-3">
                          {thumb
                            ? <img src={assetUrl(thumb)} alt="" className="h-12 w-16 shrink-0 rounded border border-border bg-muted object-cover" />
                            : <div className="h-12 w-16 shrink-0 rounded border border-dashed border-border" />}
                          <div className="min-w-0">
                            <p className="text-sm font-bold">{row.vehicleSpecs}</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(row.pricing)} · {row.mileage.toLocaleString()} mi · {row.vin}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Pill className={LISTING_STATUS_STYLE[row.status]}>{row.status}</Pill>
                        {row.status === 'SCHEDULED' && row.scheduledFor && (
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(row.scheduledFor).toLocaleString()}</p>
                        )}
                        {row.status === 'ARCHIVED' && row.archivedReason && (
                          <p className="mt-1 text-xs text-muted-foreground">{row.archivedReason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {row.status === 'PUBLISHED' && posts.length ? (
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {posts.map((p) => (
                              <Pill key={p.channel} className={CHANNEL_STATUS[p.status]?.style ?? 'bg-muted'}>
                                {p.channel}: {CHANNEL_STATUS[p.status]?.label ?? p.status}
                              </Pill>
                            ))}
                          </div>
                        ) : (
                          <p className="max-w-xs text-xs text-muted-foreground">{row.channels.join(', ')}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {row.analytics?.views ?? 0} views</span>
                        <br />
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {row.analytics?.inquiries ?? 0} inquiries</span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {row.status !== 'ARCHIVED' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditingListing(row)} aria-label="Edit listing"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => setPublishingListing(row)}>
                              <Send className="mr-1 h-3 w-3" /> {row.status === 'PUBLISHED' ? 'Channels' : 'Publish'}
                            </Button>
                            {row.status === 'PUBLISHED' && (
                              <Button variant="ghost" size="sm" onClick={() => copyPublicLink(row)} aria-label="Copy public link"><Copy className="h-4 w-4" /></Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => archive(row)} aria-label="Archive listing"><Archive className="h-4 w-4" /></Button>
                          </>
                        )}
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setListingToDelete(row)} aria-label="Delete listing">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredListings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      {listings.length ? 'No listings match.' : 'No listings yet. Create one above.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {canManageCampaigns && <AddAdvertisingDialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen} ad={editingAd} />}

      <ListingEditorDialog
        listing={editingListing}
        channels={channels}
        conditions={conditions}
        onOpenChange={(open) => !open && setEditingListing(null)}
        onSave={marketing.updateListing}
        saving={marketing.isUpdating}
      />
      <PublishDialog
        listing={publishingListing}
        channels={channels}
        onOpenChange={(open) => !open && setPublishingListing(null)}
        onPublish={marketing.publishListing}
        publishing={marketing.isPublishing}
      />
      <LeadsDialog
        open={leadsOpen}
        onOpenChange={setLeadsOpen}
        leads={leads}
        loading={marketing.leadsLoading}
        error={marketing.leadsError}
        onRetry={() => marketing.refetchLeads()}
        onStatusChange={marketing.setLeadStatus}
        onConvert={marketing.convertLead}
      />

      <AlertDialog open={Boolean(listingToDelete)} onOpenChange={(open) => !open && setListingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing and its photos are removed and its public page stops working. Leads it brought in are kept.
              To just stop advertising, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteListing} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(adToDelete)} onOpenChange={(open) => !open && setAdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign "{adToDelete?.campaignName}"?</AlertDialogTitle>
            <AlertDialogDescription>Its spend will no longer count in your marketing or expense totals.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteAd} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return wrap(content);
}
