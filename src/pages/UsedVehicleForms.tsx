import { 
  FileCheck, 
  FileText, 
  MapPin, 
  Gauge, 
  UserCheck, 
  DollarSign, 
  Eye, 
  Download, 
  FileArchive, 
  Trash2,
  UploadCloud,
  Sparkles,
  Link2,
  ChevronDown
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import UsedVehicleFormGenerator from '@/components/UsedVehicleFormGenerator';
import FormLinksPanel from '@/components/forms/FormLinksPanel';
import BillOfSaleUploader from '@/components/BillOfSaleUploader';
import { useAuth } from '@/context/auth-hooks';
import { useState, useMemo, useRef } from 'react';
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
  const detailsRef = useRef<HTMLElement>(null);
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

    // On mobile, gently scroll to the top or notification
    if (window.innerWidth < 1280) {
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
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

  const scrollToDetails = () => {
    detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <AppLayout>
      <div className="space-y-6 sm:space-y-8">
        {/* Hero Banner with Clear Guidance - Responsive for Mobile & Desktop */}
        <section className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] border border-border bg-white p-4 sm:p-6 md:p-10 shadow-lg sm:shadow-xl shadow-black/[0.03]">
          {/* Decorative background blurs */}
          <div className="absolute -right-20 -top-20 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          
          <div className="relative z-10 max-w-4xl space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 sm:px-4 sm:py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-2xs">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              AI Document Processing
            </div>
            
            <div className="space-y-1.5 sm:space-y-2">
              <h1 className="font-display text-2xl sm:text-3xl md:text-5xl font-black tracking-tight text-foreground leading-[1.15]">
                Document Upload & <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600">Auto-Processing</span>
              </h1>
              <p className="max-w-2xl text-xs sm:text-base md:text-lg leading-relaxed text-muted-foreground font-medium">
                Upload or snap vehicle titles, auction receipts, bills of sale, and repair bills. AI reads the details, syncs your inventory, and fills official DMV records in seconds.
              </p>
            </div>

            {/* 3-Step Visual Workflow Cards - Responsive for Mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-1">
              <div className="flex items-center sm:items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Upload or Snap</h4>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Take a photo or drop purchase titles, sale receipts, or repairs.
                  </p>
                </div>
              </div>

              <div className="flex items-center sm:items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">AI Extraction</h4>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    VIN, specs, price, odometer, and seller/buyer extracted in seconds.
                  </p>
                </div>
              </div>

              <div className="flex items-center sm:items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-blue-500/10 text-blue-600 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Auto-Sync & PDF</h4>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Inventory updates immediately, and DMV PDF forms are filled.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tabbed Navigation: Fully Responsive for Mobile & Desktop */}
        <Tabs defaultValue="upload" className="space-y-5 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <TabsList className="bg-muted/70 p-1 rounded-2xl border border-border/80 h-11 sm:h-12 w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
              <TabsTrigger 
                value="upload" 
                className="rounded-xl px-3 sm:px-5 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
              >
                <UploadCloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-primary shrink-0" />
                <span className="sm:hidden">Upload & Scan</span>
                <span className="hidden sm:inline">Upload & Process Documents</span>
              </TabsTrigger>
              <TabsTrigger 
                value="customer-links" 
                className="rounded-xl px-3 sm:px-5 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
              >
                <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-emerald-600 shrink-0" />
                <span className="sm:hidden">Forms & Links</span>
                <span className="hidden sm:inline">Customer Form Links & Stickers</span>
              </TabsTrigger>
            </TabsList>

            <Button 
              variant="outline" 
              size="sm"
              className="border-border rounded-xl text-xs font-semibold h-9 sm:h-10 hover:bg-muted w-full sm:w-auto justify-center bg-white"
              onClick={() => window.location.href = '/registry'}
            >
              <FileArchive className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              Full Vehicle Database →
            </Button>
          </div>

          {/* TAB 1: Main Document Upload Section */}
          <TabsContent value="upload" className="space-y-5 sm:space-y-6 mt-0">
            {/* Mobile-Only Live Scan Result Banner (Visible right at top when a scan completes on mobile!) */}
            {extractedInfo && (
              <div className="block xl:hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-3.5 shadow-sm space-y-2.5 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="h-7 w-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[10px] uppercase font-bold text-primary">Live Scan Result</p>
                      <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
                        {[extractedInfo.year, extractedInfo.make, extractedInfo.model].filter(Boolean).join(' ') || 'Vehicle Details'}
                      </h4>
                    </div>
                  </div>
                  {lastGeneratedPdf && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => setViewerOpen(true)}
                        className="h-8 px-2.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownloadLast}
                        className="h-8 w-8 p-0 rounded-lg bg-white"
                        title="Download PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/80 p-2 rounded-xl border border-border/60">
                    <span className="text-[9px] uppercase text-muted-foreground font-semibold">VIN</span>
                    <p className="font-mono text-xs font-bold text-foreground truncate">{extractedInfo.vin || '—'}</p>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-border/60">
                    <span className="text-[9px] uppercase text-muted-foreground font-semibold">Odometer</span>
                    <p className="text-xs font-bold text-foreground truncate">
                      {extractedInfo.mileage ? `${extractedInfo.mileage.toLocaleString()} mi` : '—'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={scrollToDetails}
                  className="w-full text-center text-[11px] font-medium text-primary hover:underline flex items-center justify-center gap-1 pt-1"
                >
                  View full extracted details below <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-6">
                {/* Two Clear Upload Cards Side by Side (Stacked on Mobile) */}
                <div className="grid gap-5 sm:gap-6 md:grid-cols-2">
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
                <div className="rounded-[20px] sm:rounded-[24px] border border-border bg-white p-4 sm:p-6 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FileArchive className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">Recent Generated Records</h2>
                        <p className="text-[11px] sm:text-xs text-muted-foreground font-medium">Latest state-compliant Used Vehicle PDF forms</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {recentLogs.length > 0 && (
                        <Button 
                          variant="ghost" 
                          className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 text-[10px] uppercase font-black tracking-widest h-8 px-2.5 rounded-lg"
                          onClick={async () => {
                            if (confirm('Are you sure you want to clear these recent records?')) {
                              for (const log of recentLogs) {
                                await deleteLog(log.id);
                              }
                              toast.success('Recent records cleared.');
                            }
                          }}
                        >
                          Clear
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        className="border-border hover:bg-muted text-[10px] uppercase font-black tracking-widest h-8 px-2.5 rounded-lg" 
                        onClick={() => window.location.href='/registry'}
                      >
                        All Records →
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2.5 sm:space-y-3">
                    {recentLogs.length > 0 ? (
                      recentLogs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-muted/30 border border-border/60 hover:border-primary/30 hover:bg-white hover:shadow-xs transition-all duration-200 group/row">
                          <div className="flex items-center gap-3 overflow-hidden mr-2">
                            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-white border border-border shadow-2xs flex items-center justify-center text-primary shrink-0 group-hover/row:scale-105 transition-transform">
                              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs sm:text-sm font-bold text-foreground leading-tight truncate">{log.year} {log.make} {log.model}</p>
                              <div className="flex items-center gap-1.5 sm:gap-2 mt-1">
                                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  {log.vin?.slice(-8) || 'NO VIN'}
                                </span>
                                <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground/70">{formatSafeDate(log.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Download PDF"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadPdf(log.documentBase64 || '', `UsedVehicleRecord_${log.vin}.pdf`);
                              }}
                            >
                              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
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
                              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-destructive/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete Record"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLog(log.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 sm:py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl space-y-1">
                        <p className="text-xs sm:text-sm font-medium">No recent records generated yet.</p>
                        <p className="text-[11px] text-muted-foreground/80">Upload a purchase title or bill of sale above to begin logging records.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Extracted Details Sidebar (Ref for smooth scrolling on mobile) */}
              <aside 
                ref={detailsRef}
                onClick={handleSidebarClick}
                className={cn(
                  "rounded-[20px] sm:rounded-[28px] border border-border bg-white p-4 sm:p-6 overflow-y-auto max-h-none xl:max-h-[85vh] transition-all relative group/sidebar shadow-lg sm:shadow-xl shadow-black/[0.02]",
                  extractedInfo?.vin && "cursor-pointer hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.99]"
                )}
              >
                <div className="flex items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-border/60">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl bg-primary/10 text-primary shadow-xs">
                      <FileCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">Extracted Details</h2>
                      <p className="text-[11px] sm:text-xs text-muted-foreground font-medium">
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
                        className="border-border text-foreground hover:bg-muted h-8 w-8 p-0 rounded-lg bg-white"
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
                        className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </Button>
                    </div>
                  )}
                </div>

                {extractedInfo ? (
                  <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
                    {/* Vehicle Identification Section */}
                    <div className="rounded-xl sm:rounded-2xl border border-border/80 bg-muted/40 p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Vehicle Specs</p>
                        <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">Verified</span>
                      </div>
                      <p className="font-display text-base sm:text-lg font-bold text-foreground leading-tight">
                        {[extractedInfo.year, extractedInfo.make, extractedInfo.model].filter(Boolean).join(' ')}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-border/60 bg-white p-2 sm:p-2.5">
                          <p className="text-[9px] sm:text-[10px] uppercase text-muted-foreground font-semibold">VIN</p>
                          <p className="font-mono text-[11px] sm:text-xs font-bold text-foreground mt-0.5 truncate" title={extractedInfo.vin}>
                            {extractedInfo.vin || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-white p-2 sm:p-2.5">
                          <p className="text-[9px] sm:text-[10px] uppercase text-muted-foreground font-semibold">Color</p>
                          <p className="text-[11px] sm:text-xs font-bold text-foreground mt-0.5">{extractedInfo.color || '—'}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-white p-2 sm:p-2.5">
                          <p className="text-[9px] sm:text-[10px] uppercase text-muted-foreground font-semibold">Title Number</p>
                          <p className="text-[11px] sm:text-xs font-bold text-foreground mt-0.5 truncate" title={extractedInfo.titleNumber}>
                            {extractedInfo.titleNumber || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-white p-2 sm:p-2.5">
                          <p className="text-[9px] sm:text-[10px] uppercase text-muted-foreground font-semibold">In Odometer</p>
                          <p className="text-[11px] sm:text-xs font-bold text-foreground mt-0.5">
                            {extractedInfo.mileage ? `${extractedInfo.mileage.toLocaleString()} mi` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Acquisition / Seller Section */}
                    <div className="rounded-xl sm:rounded-2xl border border-border/80 bg-muted/40 p-3.5 sm:p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span>Acquisition / Seller</span>
                      </div>
                      <p className="font-bold text-xs sm:text-sm text-foreground">{extractedInfo.purchasedFrom || 'Auction / Dealer'}</p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                        {[
                          extractedInfo.usedVehicleSourceAddress, 
                          extractedInfo.usedVehicleSourceCity, 
                          extractedInfo.usedVehicleSourceState
                        ].filter(Boolean).join(', ') || 'No address provided'}
                      </p>
                      <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
                        <span>Purchase Date:</span>
                        <span className="font-semibold text-foreground">{formatSafeDate(extractedInfo.purchaseDate)}</span>
                      </div>
                    </div>

                    {/* Disposition / Sale Section (If sold info exists) */}
                    {(extractedInfo.disposedTo || extractedInfo.disposedPrice) && (
                      <div className="rounded-xl sm:rounded-2xl border border-emerald-500/30 bg-emerald-50/40 p-3.5 sm:p-4 space-y-2.5 ring-1 ring-emerald-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold uppercase tracking-wider">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sale / Buyer Details</span>
                        </div>
                        <p className="font-bold text-xs sm:text-sm text-foreground">{extractedInfo.disposedTo || 'Retail Customer'}</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground">
                          {[
                            extractedInfo.disposedAddress, 
                            extractedInfo.disposedCity, 
                            extractedInfo.disposedState
                          ].filter(Boolean).join(', ') || 'No address on file'}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-border/60">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <div>
                              <p className="text-[9px] uppercase text-muted-foreground font-bold leading-none">Sale Price</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">
                                {extractedInfo.disposedPrice ? `$${extractedInfo.disposedPrice.toLocaleString()}` : '—'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-border/60">
                            <Gauge className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
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
                  <div className="py-8 sm:py-12 px-3 sm:px-4 text-center rounded-xl sm:rounded-2xl border border-dashed border-border/80 bg-muted/20 space-y-2.5">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-muted/60 text-muted-foreground mx-auto flex items-center justify-center">
                      <FileText className="w-5 h-5 sm:w-6 sm:h-6 opacity-60" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs sm:text-sm font-bold text-foreground">Awaiting Document</h4>
                      <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed max-w-[240px] mx-auto">
                        Snap or upload a document to view live extracted specs, prices, and records here.
                      </p>
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
