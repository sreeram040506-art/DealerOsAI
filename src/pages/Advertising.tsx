import { useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Sparkles, Megaphone, AlertTriangle, Plus, Upload, X, Image as ImageIcon, Users, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useMarketing } from '@/hooks/useMarketing';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useAuth } from '@/context/auth-hooks';
import AddAdvertisingDialog from '@/components/AddAdvertisingDialog';
import { apiUrl } from '@/lib/api';
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
  const { token } = useAuth();
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
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [leadsDialogOpen, setLeadsDialogOpen] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);

  const filteredListings = useMemo(
    () => listings.filter((row) => `${row.vin} ${row.vehicleSpecs} ${row.seoTitle}`.toLowerCase().includes(searchTerm.toLowerCase())),
    [listings, searchTerm],
  );

  const handleImageUpload = async (files: FileList | null) => {
    if (!files) return;
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please select image files only');
      return;
    }

    const base64Images: string[] = [];
    
    for (const file of imageFiles) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        base64Images.push(base64);
      } catch (error) {
        toast.error(`Failed to process ${file.name}`);
      }
    }

    setUploadedImages(prev => [...prev, ...base64Images]);
    toast.success(`${base64Images.length} image(s) added`);
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
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
    handleImageUpload(e.dataTransfer.files);
  };

  const fetchLeads = async () => {
    try {
      const response = await fetch(apiUrl('/marketing/leads/list'), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    }
  };

  const handleOpenLeadsDialog = () => {
    fetchLeads();
    setLeadsDialogOpen(true);
  };

  const handleGenerate = async () => {
    try {
      const photosToUse = uploadedImages.length > 0 ? uploadedImages : form.photos.split(',').map((p) => p.trim()).filter(Boolean);
      
      const created = await generateListing({
        vehicleId: form.vehicleId || undefined,
        vin: form.vin,
        vehicleSpecs: form.vehicleSpecs,
        photos: photosToUse,
        mileage: Number(form.mileage),
        condition: form.condition,
        pricing: Number(form.pricing),
        channels: CHANNELS,
      });
      await publishListing({ id: created.id, channels: CHANNELS });
      toast.success('AI listing generated and scheduled.');
      setForm({ vehicleId: '', vin: '', vehicleSpecs: '', photos: '', mileage: '', condition: '', pricing: '' });
      setUploadedImages([]);
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
        <>
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

          {/* MARKETING ARCHITECTURE SECTION */}
          <div className="border-t border-border pt-8">
            <h2 className="text-2xl font-bold font-display tracking-tight mb-6">Marketing Architecture</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Core Marketing Ledgers */}
              <div className="stat-card">
                <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                  <div className="w-1 h-6 bg-primary rounded-full"></div>
                  Core Marketing Ledgers
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-bold text-lg">•</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Listing Registry</p>
                      <p className="text-xs text-muted-foreground">Vehicle specs, photos, pricing per channel</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-bold text-lg">•</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Channel Ledger</p>
                      <p className="text-xs text-muted-foreground">Facebook, Instagram, TikTok, Craigslist, YouTube, etc.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-bold text-lg">•</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Analytics Ledger</p>
                      <p className="text-xs text-muted-foreground">Impressions, clicks, conversions by channel</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-bold text-lg">•</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Lead Attribution</p>
                      <p className="text-xs text-muted-foreground">Capture source, campaign, contact info</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-bold text-lg">•</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Campaign Tracking</p>
                      <p className="text-xs text-muted-foreground">Schedule, publish, monitor performance</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Automatic Marketing Events */}
              <div className="stat-card">
                <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                  <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                  Automatic Marketing Events
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 font-bold text-lg">→</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Listing Generation</p>
                      <p className="text-xs text-muted-foreground">AI creates SEO titles, descriptions, hashtags</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 font-bold text-lg">→</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Channel Publication</p>
                      <p className="text-xs text-muted-foreground">Schedule posts across all platforms</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 font-bold text-lg">→</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Performance Tracking</p>
                      <p className="text-xs text-muted-foreground">Monitor impressions, clicks, conversions</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 font-bold text-lg">→</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Lead Capture</p>
                      <p className="text-xs text-muted-foreground">Collect buyer inquiries from all sources</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-500 font-bold text-lg">→</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Attribution Analysis</p>
                      <p className="text-xs text-muted-foreground">Track which channels convert best</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Marketing AI Analysis */}
              <div className="stat-card">
                <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                  <div className="w-1 h-6 bg-green-500 rounded-full"></div>
                  Marketing AI Analysis
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="text-green-500 font-bold text-lg">✓</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Content Optimization</p>
                      <p className="text-xs text-muted-foreground">AI generates compelling titles & descriptions</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-500 font-bold text-lg">✓</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Pricing Recommendations</p>
                      <p className="text-xs text-muted-foreground">Market-based pricing optimization</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-500 font-bold text-lg">✓</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Channel Selection</p>
                      <p className="text-xs text-muted-foreground">Recommend best-performing platforms</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-500 font-bold text-lg">✓</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Performance Anomalies</p>
                      <p className="text-xs text-muted-foreground">Flag underperforming campaigns</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-500 font-bold text-lg">✓</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">ROI Analysis</p>
                      <p className="text-xs text-muted-foreground">Calculate return on ad spend per channel</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Advertising Campaigns Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Advertising Campaigns</h2>
          <div className="flex gap-2">
            <Button 
              onClick={handleOpenLeadsDialog}
              variant="outline"
              className="h-10 px-4 font-black uppercase tracking-widest text-[10px] shadow-sm transition-all"
            >
              <Users className="w-4 h-4 mr-2" />
              View Leads
            </Button>
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
        </div>

        {/* Image Upload Section */}
        <div className="space-y-3">
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('image-upload-input')?.click()}
          >
            <input
              id="image-upload-input"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {isDragging ? 'Drop images here' : 'Click to upload or drag & drop images'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 10MB each</p>
          </div>

          {/* Image Previews */}
          {uploadedImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {uploadedImages.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={image}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveImage(index);
                    }}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Fallback: URL Input */}
          {uploadedImages.length === 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Or paste URLs:</span>
              <Input
                placeholder="Photos (comma-separated URLs)"
                value={form.photos}
                onChange={(e) => setForm({ ...form, photos: e.target.value })}
                className="flex-1"
              />
            </div>
          )}
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
                            // Refresh leads if dialog is open
                            if (leadsDialogOpen) {
                              fetchLeads();
                            }
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
      
      {/* Leads Dialog */}
      <Dialog open={leadsDialogOpen} onOpenChange={setLeadsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-black font-display tracking-tight text-foreground uppercase flex items-center gap-2">
              <Users className="w-5 h-5" />
              Captured Marketing Leads
            </DialogTitle>
          </DialogHeader>
          
          {leads.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No leads captured yet</p>
              <p className="text-xs text-muted-foreground mt-1">Leads will appear here when captured from marketing channels</p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Source</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Campaign</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Lead Name</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Contact</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{lead.source}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{lead.campaign || '-'}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{lead.leadName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {lead.leadPhone && <div className="text-xs">{lead.leadPhone}</div>}
                          {lead.leadEmail && <div className="text-xs">{lead.leadEmail}</div>}
                          {!lead.leadPhone && !lead.leadEmail && '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  return isSubpage ? content : <AppLayout>{content}</AppLayout>;
}
