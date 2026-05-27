import { useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Sparkles, Megaphone, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useMarketing } from '@/hooks/useMarketing';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import AddAdvertisingDialog from '@/components/AddAdvertisingDialog';
import { formatCurrency } from '@/lib/utils';

interface AdvertisingProps {
  isSubpage?: boolean;
}

const CHANNELS = [
  'Facebook Marketplace',
  'Instagram',
  'TikTok',
  'Dealer Website',
  'Craigslist',
  'YouTube Shorts',
  'Google Vehicle Listings',
];

export default function Advertising({ isSubpage = false }: AdvertisingProps) {
  const { listings, isLoading: marketingLoading, isError: marketingError, generateListing, updateSchedule, updateAnalytics, publishListing, captureLead, isSaving } = useMarketing();
  const { ads, isLoading: adsLoading, isError: adsError } = useAdvertising();
  const { vehicles } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    vehicleId: '',
    vin: '',
    vehicleSpecs: '',
    photos: '',
    mileage: '',
    condition: '',
    pricing: '',
  });

  const [advertisingDialogOpen, setAdvertisingDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<any>(null);

  const filteredListings = useMemo(
    () => listings.filter((row) => `${row.vin} ${row.vehicleSpecs} ${row.seoTitle}`.toLowerCase().includes(searchTerm.toLowerCase())),
    [listings, searchTerm],
  );

  const handleGenerate = async () => {
    try {
      const created = await generateListing({
        vehicleId: form.vehicleId || undefined,
        vin: form.vin,
        vehicleSpecs: form.vehicleSpecs,
        photos: form.photos.split(',').map((p) => p.trim()).filter(Boolean),
        mileage: Number(form.mileage),
        condition: form.condition,
        pricing: Number(form.pricing),
        channels: CHANNELS,
      });
      await publishListing({ id: created.id, channels: CHANNELS });
      toast.success('AI listing generated and scheduled.');
      setForm({ vehicleId: '', vin: '', vehicleSpecs: '', photos: '', mileage: '', condition: '', pricing: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate listing');
    }
  };

  if (marketingLoading || adsLoading) return <div className="p-8 text-center text-muted-foreground">Loading marketing distribution...</div>;
  if (marketingError || adsError) {
    const errorState = <QueryErrorState title="Could not load marketing data" description="The data request failed." />;
    return isSubpage ? errorState : <AppLayout>{errorState}</AppLayout>;
  }

  const content = (
    <div className="space-y-8">
      {!isSubpage && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Multi-Channel Distribution</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">AI-powered listing generation, scheduling, analytics, and lead attribution.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search VIN or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-border bg-muted/50 pl-10 text-foreground focus-visible:ring-primary/50"
            />
          </div>
        </div>
      )}

      {/* Advertising Campaigns Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Advertising Campaigns</h2>
          <Button 
            onClick={() => {
              setEditingAd(null);
              setAdvertisingDialogOpen(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 font-black uppercase tracking-widest text-[10px] shadow-sm transition-all"
          >
            <Megaphone className="w-4 h-4 mr-2" />
            Launch Campaign
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Campaign</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Platform</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Status</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Spend vs Budget</th>
                  <th className="text-right px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => {
                  const isOverBudget = ad.budgetLimit && ad.amountSpent >= ad.budgetLimit;
                  return (
                    <tr 
                      key={ad.id} 
                      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isOverBudget ? 'bg-destructive/10' : ''}`}
                    >
                      <td className="px-6 py-4 font-bold text-foreground text-sm">
                        <div className="flex items-center gap-2">
                          {isOverBudget && <AlertTriangle className="w-4 h-4 text-destructive" />}
                          {ad.campaignName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">{ad.platform}</td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          ad.status === 'Active' ? 'bg-green-500/20 text-green-500' :
                          ad.status === 'Paused' ? 'bg-yellow-500/20 text-yellow-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {ad.status || 'Active'}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm font-medium ${isOverBudget ? 'text-destructive font-bold' : 'text-foreground'}`}>
                        {formatCurrency(ad.amountSpent)} {ad.budgetLimit ? `/ ${formatCurrency(ad.budgetLimit)}` : ''}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingAd(ad);
                            setAdvertisingDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {ads.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No active advertising campaigns.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Marketing Listings Section */}
      <section className="stat-card space-y-4">
        <h2 className="text-lg font-semibold">Listing Generation Pipeline</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.vehicleId}
            onChange={(e) => {
              const selectedId = e.target.value;
              if (!selectedId) {
                setForm({
                  vehicleId: '',
                  vin: '',
                  vehicleSpecs: '',
                  photos: '',
                  mileage: '',
                  condition: '',
                  pricing: '',
                });
                return;
              }
              const v = vehicles.find((veh) => veh.id === selectedId);
              if (v) {
                setForm({
                  vehicleId: v.id,
                  vin: v.vin || '',
                  vehicleSpecs: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
                  photos: '',
                  mileage: v.mileage !== undefined ? String(v.mileage) : '',
                  condition: 'Excellent',
                  pricing: v.purchasePrice !== undefined ? String(v.purchasePrice) : '',
                });
              }
            }}
          >
            <option value="">Select Inventory Vehicle (optional)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{[v.year, v.make, v.model, v.vin].filter(Boolean).join(' ')}</option>
            ))}
          </select>
          <Input placeholder="VIN" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          <Input placeholder="Vehicle Specs (Year Make Model Trim)" value={form.vehicleSpecs} onChange={(e) => setForm({ ...form, vehicleSpecs: e.target.value })} />
          <Input placeholder="Mileage" type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
          <Input placeholder="Condition" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
          <Input placeholder="Pricing" type="number" value={form.pricing} onChange={(e) => setForm({ ...form, pricing: e.target.value })} />
          <Input placeholder="Photos (comma-separated URLs)" value={form.photos} onChange={(e) => setForm({ ...form, photos: e.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground">Channels: {CHANNELS.join(', ')}</p>
        <Button onClick={handleGenerate} disabled={isSaving} className="bg-primary text-primary-foreground">
          <Sparkles className="w-4 h-4 mr-2" />
          {isSaving ? 'Generating...' : 'Generate + Publish Ad'}
        </Button>
      </section>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">VIN</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">SEO Title</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Channels</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Analytics</th>
                <th className="text-right px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map((row) => {
                const analytics = row.analytics || {};
                return (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground text-sm">{row.vin}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{row.seoTitle}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{row.channels.join(', ')}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      Impr: {analytics.impressions || 0} | Clicks: {analytics.clicks || 0} | Leads: {analytics.leads || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const existing = Array.isArray(row.scheduledPosts) ? row.scheduledPosts : [];
                            const next = existing.map((item: any) => ({ ...item, status: 'SCHEDULED' }));
                            await updateSchedule({ id: row.id, scheduledPosts: next });
                            toast.success('Scheduled posts updated.');
                          }}
                        >
                          Schedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await updateAnalytics({
                              id: row.id,
                              analytics: {
                                impressions: (analytics.impressions || 0) + 200,
                                clicks: (analytics.clicks || 0) + 17,
                                leads: (analytics.leads || 0) + 3,
                              },
                              leadAttribution: {
                                byChannel: {
                                  ...(row.leadAttribution?.byChannel || {}),
                                  'Facebook Marketplace': ((row.leadAttribution?.byChannel?.['Facebook Marketplace']) || 0) + 1,
                                },
                              },
                            });
                            toast.success('Analytics + lead attribution updated.');
                          }}
                        >
                          Track
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await captureLead({
                              id: row.id,
                              source: 'Facebook Marketplace',
                              campaign: row.vin,
                              leadName: 'New Buyer',
                            });
                            toast.success('Lead captured from marketing channel.');
                          }}
                        >
                          Capture Lead
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredListings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No generated listings yet. Use the pipeline above to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AddAdvertisingDialog open={advertisingDialogOpen} onOpenChange={setAdvertisingDialogOpen} ad={editingAd} />
    </div>
  );

  return isSubpage ? content : <AppLayout>{content}</AppLayout>;
}
