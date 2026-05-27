import { FileBadge2, FileCheck, FileText, MapPin, CalendarDays, Gauge, UserCheck, DollarSign, Eye, Download, FileArchive, Trash2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import UsedVehicleFormGenerator from '@/components/UsedVehicleFormGenerator';
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
    return [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);
  }, [logs]);

  const handleDeleteLog = async (id: string) => {
    try {
      await deleteLog(id);
      toast.success('Record removed from registry.');
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
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-white p-8 md:p-12 shadow-xl shadow-black/[0.03]">
          {/* Decorative background elements */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-foreground/10 blur-3xl" />
          
          <div className="relative z-10 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm">
              <FileBadge2 className="h-3.5 w-3.5" />
              PDF Workflow Automation
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight text-foreground leading-[1.1]">
              Manage Used <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-foreground">Vehicle Records</span>
            </h1>
            <p className="max-w-2xl text-base md:text-lg leading-relaxed text-muted-foreground font-medium">
              Generate or update Used Vehicle forms automatically. Upload a purchase document to log a new vehicle, 
              or a Bill of Sale to fill in the disposition details for an existing vehicle.
            </p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
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
                    <h2 className="text-lg font-bold text-foreground tracking-tight">Recent Records</h2>
                    <p className="text-xs text-muted-foreground font-medium">Your latest generated PDF forms</p>
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
                  <Button variant="outline" className="border-border hover:bg-muted text-[10px] uppercase font-black tracking-widest h-8 px-3 rounded-lg" onClick={() => window.location.href='/registry'}>
                    Full Registry →
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3">
                {recentLogs.length > 0 ? (
                  recentLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/60 hover:border-primary/30 hover:bg-white hover:shadow-md transition-all duration-300 group/row">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-white border border-border shadow-sm flex items-center justify-center text-primary group-hover/row:scale-110 transition-transform">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground leading-tight">{log.year} {log.make} {log.model}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-wider">{log.vin?.slice(-8)}</span>
                            <span className="text-[10px] font-medium text-muted-foreground/60">{formatSafeDate(log.createdAt)}</span>
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
                  <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                    No recent records found. Push a document to start logging.
                  </div>
                )}
              </div>
            </div>
          </div>


          <aside 
            onClick={handleSidebarClick}
            className={cn(
              "rounded-[28px] border border-border bg-white p-6 overflow-y-auto max-h-[85vh] transition-all relative group/sidebar shadow-xl shadow-black/[0.02]",
              extractedInfo?.vin && "cursor-pointer hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.99]"
            )}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
                  <FileCheck className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-foreground tracking-tight">Extracted Details</h2>
                  <p className="text-xs text-muted-foreground font-medium">Verified vehicle data</p>
                </div>
              </div>
              
              {lastGeneratedPdf && (
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadLast();
                    }}
                    className="border-border text-foreground hover:bg-muted h-9 rounded-lg"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerOpen(true);
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-9 rounded-lg shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    Preview
                  </Button>
                </div>
              )}
            </div>

            {extractedInfo ? (
                <div className="space-y-6 mt-6">
                  {/* Vehicle Section */}
                  <div className="rounded-2xl border border-border bg-muted/60 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2 font-semibold">Vehicle Identification</p>
                    <p className="font-display text-xl font-bold text-foreground leading-tight">
                      {[extractedInfo.year, extractedInfo.make, extractedInfo.model].filter(Boolean).join(' ')}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-border/60 bg-card/50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">VIN</p>
                        <p className="text-xs font-medium text-muted-foreground mt-1 truncate" title={extractedInfo.vin}>{extractedInfo.vin || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Color</p>
                        <p className="text-xs font-medium text-muted-foreground mt-1">{extractedInfo.color || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Title #</p>
                        <p className="text-xs font-medium text-muted-foreground mt-1 truncate" title={extractedInfo.titleNumber}>{extractedInfo.titleNumber || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Seller/Acquisition Section */}
                  <div className="rounded-2xl border border-border bg-muted/60 p-4">
                    <div className="flex items-center gap-2 mb-2">
                       <MapPin className="w-3.5 h-3.5 text-primary" />
                       <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Acquisition</p>
                    </div>
                    <p className="font-semibold text-sm text-foreground">{extractedInfo.purchasedFrom || 'Auction / Dealer'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        extractedInfo.usedVehicleSourceAddress, 
                        extractedInfo.usedVehicleSourceCity, 
                        extractedInfo.usedVehicleSourceState
                      ].filter(Boolean).join(', ') || 'No address provided'}
                    </p>
                    <div className="mt-3 flex gap-4 section-meta">
                       <div>
                         <p className="text-[10px] uppercase text-muted-foreground">Date</p>
                         <p className="text-xs font-medium text-muted-foreground">
                           {formatSafeDate(extractedInfo.purchaseDate)}
                         </p>
                       </div>
                       <div>
                         <p className="text-[10px] uppercase text-muted-foreground">In Odometer</p>
                         <p className="text-xs font-medium text-muted-foreground">{extractedInfo.mileage?.toLocaleString() || '—'}</p>
                       </div>
                    </div>
                  </div>

                  {/* Disposition Section - ONLY SHOW IF DISPOSED INFO EXISTS */}
                  {(extractedInfo.disposedTo || extractedInfo.disposedPrice) && (
                    <div className="rounded-2xl border border-border bg-muted/60 p-4 ring-1 ring-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                         <UserCheck className="w-3.5 h-3.5 text-primary" />
                         <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Disposition (Sale)</p>
                      </div>
                      <p className="font-semibold text-sm text-foreground">{extractedInfo.disposedTo || 'Cash Customer'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          extractedInfo.disposedAddress, 
                          extractedInfo.disposedCity, 
                          extractedInfo.disposedState
                        ].filter(Boolean).join(', ') || 'No address provided'}
                      </p>
                      
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 bg-card/50 p-2 rounded-lg border border-border/60">
                           <DollarSign className="w-3.5 h-3.5 text-primary" />
                           <div>
                             <p className="text-[9px] uppercase text-muted-foreground leading-none">Price</p>
                             <p className="text-sm font-bold text-foreground mt-0.5">
                               {extractedInfo.disposedPrice ? `$${extractedInfo.disposedPrice.toLocaleString()}` : '—'}
                             </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 bg-card/50 p-2 rounded-lg border border-border/60">
                           <Gauge className="w-3.5 h-3.5 text-primary" />
                           <div>
                             <p className="text-[9px] uppercase text-muted-foreground leading-none">Out Miles</p>
                             <p className="text-sm font-bold text-foreground mt-0.5">
                               {extractedInfo.disposedOdometer?.toLocaleString() || '—'}
                             </p>
                           </div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-between items-center text-[10px] text-muted-foreground bg-card/30 p-2 rounded-md">
                         <span>Date: {formatSafeDate(extractedInfo.disposedDate)}</span>
                         <span>DL: {extractedInfo.disposedDlNumber || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm leading-6 text-muted-foreground">
                Generate or update a form once and the extracted vehicle information will appear here so
                you can quickly verify the filled values.
              </div>
            )}
          </aside>
        </div>
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

function formatFieldValue(
  key: string,
  info: ExtractedVehicleDocumentInfo
) {
  const value = info[key as keyof ExtractedVehicleDocumentInfo];

  if (!value && value !== 0) {
    return '';
  }

  if (key === 'purchaseDate' && typeof value === 'string') {
    const date = new Date(value + 'Z');
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  if (key === 'mileage' && typeof value === 'number') {
    return `${value.toLocaleString()} mi`;
  }

  return String(value);
}
