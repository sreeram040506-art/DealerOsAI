import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DocumentUpload from '@/components/DocumentUpload';
import { useAuth } from '@/context/auth-hooks';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';
import { 
  Camera, 
  FileCheck, 
  Download, 
  Car, 
  DollarSign, 
  MapPin, 
  Eye, 
  PlusCircle, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatSafeDate } from '@/lib/dateUtils';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';

export default function MobileScanner() {
  const { token } = useAuth();
  const [lastScan, setLastScan] = useState<ExtractedVehicleDocumentInfo | null>(null);
  const [lastPdf, setLastPdf] = useState<{ base64: string; fileName: string } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const handleScan = (
    data: ExtractedVehicleDocumentInfo, 
    pdfData?: { base64: string; fileName: string }
  ) => {
    setLastScan(data);
    if (pdfData) {
      setLastPdf(pdfData);
    }
  };

  const handleDownload = () => {
    if (!lastPdf) return;
    try {
      let clean = lastPdf.base64;
      if (clean.includes('base64,')) clean = clean.split('base64,')[1];
      clean = clean.replace(/[^A-Za-z0-9+/=]/g, '');
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = lastPdf.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-2xl mx-auto pb-10">
        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">
            <Camera className="w-3.5 h-3.5" />
            Lot & Document Scanner
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Mobile AI Scanner
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Snap photos of vehicle titles, window stickers, or purchase slips on the lot to instantly extract details.
          </p>
        </div>

        {/* Upload / Camera Card */}
        <div className="rounded-[20px] sm:rounded-2xl border border-border bg-white p-3.5 sm:p-5 shadow-xs">
          <DocumentUpload
            token={token}
            onScanComplete={handleScan}
          />
        </div>

        {/* Extracted Result Card */}
        {lastScan ? (
          <div className="rounded-[20px] sm:rounded-2xl border border-primary/20 bg-white p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-primary">Scan Result</span>
                  <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                    {[lastScan.year, lastScan.make, lastScan.model].filter(Boolean).join(' ') || 'Vehicle Specs'}
                  </h3>
                </div>
              </div>

              {lastPdf && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => setViewerOpen(true)}
                    className="h-8 px-2.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownload}
                    className="h-8 w-8 p-0 rounded-lg bg-white"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Specs Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">VIN</span>
                <p className="font-mono text-xs font-bold text-foreground mt-0.5 truncate" title={lastScan.vin}>
                  {lastScan.vin || '—'}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Odometer</span>
                <p className="text-xs font-bold text-foreground mt-0.5">
                  {lastScan.mileage ? `${lastScan.mileage.toLocaleString()} mi` : '—'}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Color</span>
                <p className="text-xs font-bold text-foreground mt-0.5">{lastScan.color || '—'}</p>
              </div>

              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Purchase Price</span>
                <p className="text-xs font-bold text-foreground mt-0.5">
                  {lastScan.purchasePrice ? `$${Number(lastScan.purchasePrice).toLocaleString()}` : '—'}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 col-span-2">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">Purchased From</span>
                <p className="text-xs font-bold text-foreground mt-0.5 truncate">{lastScan.purchasedFrom || '—'}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 text-xs font-bold"
                onClick={() => window.location.href = '/inventory'}
              >
                <Car className="w-4 h-4 mr-1.5" />
                Go to Inventory
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl h-11 text-xs font-semibold bg-white"
                onClick={() => window.location.href = '/documents-forms'}
              >
                Open Full Document Center →
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-[20px] sm:rounded-2xl border border-dashed border-border bg-white text-center space-y-2">
            <div className="h-10 w-10 rounded-xl bg-muted/60 text-muted-foreground mx-auto flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-bold text-foreground">No Active Scan</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Snap a picture of any vehicle document above to extract VIN, price, and specs right on your phone.
            </p>
          </div>
        )}
      </div>

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentBase64={lastPdf?.base64 || null}
        vehicleName={lastScan ? `${lastScan.year} ${lastScan.make} ${lastScan.model}` : 'Vehicle'}
        documentType="Used Vehicle Record (Scanned)"
      />
    </AppLayout>
  );
}
