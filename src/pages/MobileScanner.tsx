import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DocumentUpload from '@/components/DocumentUpload';
import { useAuth } from '@/context/auth-hooks';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';

export default function MobileScanner() {
  const { token } = useAuth();
  const [lastScan, setLastScan] = useState<ExtractedVehicleDocumentInfo | null>(null);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Mobile Scanner</h1>
          <p className="text-muted-foreground mt-1">
            Capture from camera or upload a file to extract vehicle data and push it into your workflow.
          </p>
        </div>

        <section className="stat-card">
          <DocumentUpload
            token={token}
            onScanComplete={(data) => setLastScan(data)}
          />
        </section>

        <section className="stat-card">
          <h2 className="font-semibold mb-3">Last Scan Result</h2>
          {!lastScan ? (
            <p className="text-muted-foreground">No scan yet. Use camera or upload to begin.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">VIN:</span> {lastScan.vin || '—'}</div>
              <div><span className="text-muted-foreground">Year:</span> {lastScan.year || '—'}</div>
              <div><span className="text-muted-foreground">Make:</span> {lastScan.make || '—'}</div>
              <div><span className="text-muted-foreground">Model:</span> {lastScan.model || '—'}</div>
              <div><span className="text-muted-foreground">Mileage:</span> {lastScan.mileage?.toLocaleString?.() || '—'}</div>
              <div><span className="text-muted-foreground">Title #:</span> {lastScan.titleNumber || '—'}</div>
              <div><span className="text-muted-foreground">Purchased From:</span> {lastScan.purchasedFrom || '—'}</div>
              <div><span className="text-muted-foreground">Purchase Date:</span> {lastScan.purchaseDate || '—'}</div>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
