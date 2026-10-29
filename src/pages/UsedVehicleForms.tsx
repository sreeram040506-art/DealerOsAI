import { 
  FileBadge2, 
  FileCheck, 
  FileText, 
  MapPin, 
  CalendarDays, 
  Gauge, 
  UserCheck, 
  DollarSign, 
  Eye, 
  Download, 
  FileArchive, 
  Trash2,
  UploadCloud,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Link2,
  Car,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import UsedVehicleFormGenerator from '@/components/UsedVehicleFormGenerator';
import FormLinksPanel from '@/components/forms/FormLinksPanel';
import BillOfSaleUploader from '@/components/BillOfSaleUploader';
import { useAuth } from '@/context/auth-hooks';
import { useState, useMemo } from 'react';
import { formatSafeDate } from '@/lib/dateUtils';
import { ExtractedVehicleDocumentInfo, Vehicle } from '@/types/inventory';
import { useInventory } from '@/hooks/useInventory';
import { useRegistry } from '@/hooks/useRegistry';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function UsedVehicleForms() {
  const { token } = useAuth();
  const [extractedInfo, setExtractedInfo] = useState<ExtractedVehicleDocumentInfo | null>(null);
  const [lastGeneratedPdf, setLastGeneratedPdf] = useState<{ base64: string; name: string } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { vehicles } = useInventory();
  const { logs, deleteLog } = useRegistry();

  const handleScanComplete = (data: { info?: ExtractedVehicleDocumentInfo; pdfBase64?: string; fileName?: string }) => {
    if (!data?.info) {
      toast.error('Could not read extracted vehicle details from this upload.');
      return;
    }

    setExtractedInfo(data.info);
    setLastGeneratedPdf({ 
      base64: data.pdfBase64 || '', 
      name: data.fileName || `UsedVehicleRecord_${data.info.vin || 'New'}.pdf` 
    });
  };

  const downloadPdf = (base64: string, fileName: string) => {
    try {
      let cleanBase64 = base64;
      if (cleanBase64.includes('base64,')) {
        cleanBase64 = cleanBase64.split('base64,')[1];
      }
      cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

      const byteCharacters = atob(cleanBase64);
      const byteArrays = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }
      
      const blob = new Blob(byteArrays, { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Failed to download PDF.');
    }
  };

  const handleDownloadLast = () => {
    if (!lastGeneratedPdf) return;
    downloadPdf(lastGeneratedPdf.base64, lastGeneratedPdf.name);
  };

  const recentLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  }, [logs]);

  const handleDeleteLog = async (id: string) => {
    try {
      await deleteLog(id);
      toast.success('Record removed from the Vehicle Database.');
    } catch (err) {
      toast.error('Failed to remove record.');
    }
  };

  const handleSidebarClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!extractedInfo?.vin) return;
    const vehicle = vehicles.find(v => v.vin === extractedInfo.vin);
    if (vehicle) {
      setSelectedVehicle(vehicle);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero Banner with Clear Guidance */}
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-white p-8 md:p-10 shadow-xl shadow-black/[0.03]">
          {/* Decorative background blurs */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          
          <div className="relative z-10 max-w-4xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-xs">
              <Sparkles className="h-3.5 w-3.5" />
              AI Document Processing & Registry
            </div>
            
            <div className="space-y-2">
              <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight text-foreground leading-[1.1]">
                Document Upload & <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600">Auto-Processing</span>
              </h1>
              <p className="max-w-2xl text-base md:text-lg leading-relaxed text-muted-foreground font-medium">
                Upload purchase titles, auction receipts, bills of sale, and repair bills. AI reads the details, syncs your inventory, and fills official DMV records in seconds.
              </p>
            </div>

            {/* 3-Step Visual Workflow Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Upload Document</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Drop a purchase title, auction bill, sale receipt, or repair bill.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">AI Reads Everything</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    VIN, specs, price, odometer, and seller/buyer are extracted automatically.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
                <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Instant Sync & Record</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Vehicle updates in inventory, and official state PDF is generated.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tabbed Navigation: Keeps Document Upload front and center */}
        <Tabs defaultValue="upload" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList className="bg-muted/70 p-1 rounded-2xl border border-border/80 h-12 inline-flex">
              <TabsTrigger 
                value="upload" 
                className="rounded-xl px-5 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
              >
                <UploadCloud className="w-4 h-4 mr-2 text-primary" />
                Upload & Process Documents
              </TabsTrigger>
              <TabsTrigger 
                value="customer-links" 
                className="rounded-xl px-5 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
              >
                <Link2 className="w-4 h-4 mr-2 text-emerald-600" />
                Customer Form Links & Stickers
              </TabsTrigger>
            </TabsList>

            <Button 
              variant="outline" 
              size="sm"
              className="border-border rounded-xl text-xs font-semibold h-10 hover:bg-muted"
              onClick={() => window.location.href = '/registry'}
            >
              <FileArchive className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              View Full Vehicle Database →
            </Button>
          </div>

          {/* TAB 1: Main Document Upload Section */}
          <TabsContent value="upload" className="space-y-6 mt-0">
            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-6">
                {/* Two Clear Upload Cards Side by Side */}
                <div className="grid gap-6 md:grid-cols-2">
                  <UsedVehicleFormGenerator
                    token={token}
                    onScanComplete={handleScanComplete}
                  />
                  <BillOfSaleUploader
                    token={token}
                    onUploadComplete={handleScanComplete}
                  />
                </div>

                {/* Recent Activity Section */}
                <div className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FileArchive className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-foreground tracking-tight">Recent Generated Records</h2>
                        <p className="text-xs text-muted-foreground font-medium">Latest state-compliant Used Vehicle PDF forms</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {recentLogs.length > 0 && (
                        <Button 
                          variant="ghost" 
                          className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 text-[10px] uppercase font-black tracking-widest h-8 px-3 rounded-lg"
                          onClick={async () => {
                            if (confirm('Are you sure you want to clear these recent records?')) {
                              for (const log of recentLogs) {
                                await deleteLog(log.id);
                              }
                              toast.success('Recent records cleared.');
                            }
                          }}
                        >
                          Clear Recent
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        className="border-border hover:bg-muted text-[10px] uppercase font-black tracking-widest h-8 px-3 rounded-lg" 
                        onClick={() => window.location.href='/registry'}
                      >
                        Vehicle Database →
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {recentLogs.length > 0 ? (
                      recentLogs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60 hover:border-primary/30 hover:bg-white hover:shadow-md transition-all duration-300 group/row">
                          <div className="flex items-center gap-4">
                            <div className="h-11 w-11 rounded-xl bg-white border border-border shadow-xs flex items-center justify-center text-primary group-hover/row:scale-105 transition-transform">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground leading-tight">{log.year} {log.make} {log.model}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  {log.vin?.slice(-8) || 'NO VIN'}
                                </span>
                                <span className="text-[10px] font-medium text-muted-foreground/70">{formatSafeDate(log.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-9 w-9 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Download PDF"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadPdf(log.documentBase64 || '', `UsedVehicleRecord_${log.vin}.pdf`);
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-9 w-9 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Preview"
                              onClick={() => {
                                setExtractedInfo({
                                  vin: log.vin || '',
                                  make: log.make || '',
                                  model: log.model || '',
                                  year: Number(log.year) || 0,
                                  mileage: Number(log.mileage) || 0,
                                  color: log.color || '',
                                  purchasedFrom: log.purchasedFrom || '',
                                  purchaseDate: log.purchaseDate || '',
                                  disposedTo: log.disposedTo || '',
                                  disposedPrice: Number(log.disposedPrice) || 0,
                                  disposedDate: log.disposedDate || '',
                                  disposedOdometer: Number(log.disposedOdometer) || 0,
                                  titleNumber: log.titleNumber || '',
                                } as any);
                                setLastGeneratedPdf({ 
                                  base64: log.documentBase64 || '', 
                                  name: `Registry_${log.vin}.pdf` 
                                });
                                setViewerOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-9 w-9 rounded-lg text-destructive/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"
                              title="Delete Record"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLog(log.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl space-y-1">
                        <p className="text-sm font-medium">No recent records generated yet.</p>
                        <p className="text-xs text-muted-foreground/80">Upload a purchase title or bill of sale above to begin logging records.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Extracted Details Sidebar */}
              <aside 
                onClick={handleSidebarClick}
                className={cn(
                  "rounded-[28px] border border-border bg-white p-6 overflow-y-auto max-h-[85vh] transition-all relative group/sidebar shadow-xl shadow-black/[0.02]",
                  extractedInfo?.vin && "cursor-pointer hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.99]"
                )}
              >
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/60">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                      <FileCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground tracking-tight">Extracted Details</h2>
                      <p className="text-xs text-muted-foreground font-medium">
                        {extractedInfo ? 'Verified vehicle data' : 'Awaiting document upload'}
                      </p>
                    </div>
                  </div>
                  
                  {lastGeneratedPdf && (
                    <div className="flex gap-1.5">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadLast();
                        }}
                        className="border-border text-foreground hover:bg-muted h-8 w-8 p-0 rounded-lg"
                        title="Download PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewerOpen(true);
                        }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </Button>
                    </div>
                  )}
                </div>

                {extractedInfo ? (
                  <div className="space-y-5 animate-in fade-in duration-300">
                    {/* Vehicle Identification Section */}
                    <div className="rounded-2xl border border-border/80 bg-muted/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Vehicle Specs</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">Verified</span>
                      </div>
                      <p className="font-display text-lg font-bold text-foreground leading-tight">
                        {[extractedInfo.year, extractedInfo.make, extractedInfo.model].filter(Boolean).join(' ')}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-border/60 bg-white p-2.5">
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">VIN</p>
                          <p className="font-mono text-xs font-bold text-foreground mt-0.5 truncate" title={extractedInfo.vin}>
                            {extractedInfo.vin || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-white p-2.5">
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Color</p>
                          <p className="text-xs font-bold text-foreground mt-0.5">{extractedInfo.color || '—'}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-white p-2.5">
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Title Number</p>
                          <p className="text-xs font-bold text-foreground mt-0.5 truncate" title={extractedInfo.titleNumber}>
                            {extractedInfo.titleNumber || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-white p-2.5">
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold">In Odometer</p>
                          <p className="text-xs font-bold text-foreground mt-0.5">
                            {extractedInfo.mileage ? `${extractedInfo.mileage.toLocaleString()} mi` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Acquisition / Seller Section */}
                    <div className="rounded-2xl border border-border/80 bg-muted/40 p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span>Acquisition / Seller</span>
                      </div>
                      <p className="font-bold text-sm text-foreground">{extractedInfo.purchasedFrom || 'Auction / Dealer'}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {[
                          extractedInfo.usedVehicleSourceAddress, 
                          extractedInfo.usedVehicleSourceCity, 
                          extractedInfo.usedVehicleSourceState
                        ].filter(Boolean).join(', ') || 'No address provided'}
                      </p>
                      <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Purchase Date:</span>
                        <span className="font-semibold text-foreground">{formatSafeDate(extractedInfo.purchaseDate)}</span>
                      </div>
                    </div>

                    {/* Disposition / Sale Section (If sold info exists) */}
                    {(extractedInfo.disposedTo || extractedInfo.disposedPrice) && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/40 p-4 space-y-3 ring-1 ring-emerald-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold uppercase tracking-wider">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sale / Buyer Details</span>
                        </div>
                        <p className="font-bold text-sm text-foreground">{extractedInfo.disposedTo || 'Retail Customer'}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            extractedInfo.disposedAddress, 
                            extractedInfo.disposedCity, 
                            extractedInfo.disposedState
                          ].filter(Boolean).join(', ') || 'No address on file'}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-border/60">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                            <div>
                              <p className="text-[9px] uppercase text-muted-foreground font-bold leading-none">Sale Price</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">
                                {extractedInfo.disposedPrice ? `$${extractedInfo.disposedPrice.toLocaleString()}` : '—'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-border/60">
                            <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                            <div>
                              <p className="text-[9px] uppercase text-muted-foreground font-bold leading-none">Out Miles</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">
                                {extractedInfo.disposedOdometer ? `${extractedInfo.disposedOdometer.toLocaleString()} mi` : '—'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-muted-foreground bg-white/80 p-2 rounded-lg border border-border/40">
                          <span>Date: {formatSafeDate(extractedInfo.disposedDate)}</span>
                          <span>DL: {extractedInfo.disposedDlNumber || '—'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-border/80 bg-muted/20 space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground mx-auto flex items-center justify-center">
                      <FileText className="w-6 h-6 opacity-60" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-foreground">No Document Scanned Yet</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px] mx-auto">
                        Upload a purchase document or bill of sale on the left to see live extracted vehicle details, prices, and records here.
                      </p>
                    </div>
                    <div className="pt-2 text-[11px] text-muted-foreground/80 space-y-1 text-left inline-block">
                      <p>✓ Instant VIN decode & verification</p>
                      <p>✓ Auto-populated seller & buyer info</p>
                      <p>✓ 1-click preview of official state record</p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </TabsContent>

          {/* TAB 2: Customer Remote Signing Links & Stickers */}
          <TabsContent value="customer-links" className="mt-0">
            <FormLinksPanel />
          </TabsContent>
        </Tabs>
      </div>

      <VehicleDetailDialog 
        vehicle={selectedVehicle} 
        open={!!selectedVehicle} 
        onOpenChange={(open) => !open && setSelectedVehicle(null)} 
      />

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentBase64={lastGeneratedPdf?.base64 || null}
        vehicleName={extractedInfo ? `${extractedInfo.year} ${extractedInfo.make} ${extractedInfo.model}` : "Vehicle"}
        documentType="Used Vehicle Record (Generated)"
      />
    </AppLayout>
  );
}
