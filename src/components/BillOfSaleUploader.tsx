import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileUp, CheckCircle2, FileText, Loader2, Fingerprint, User, DollarSign, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiUrl } from '@/lib/api';
import { Input } from '@/components/ui/input';

interface BillOfSaleUploaderProps {
  token: string | null;
  onUploadComplete: (data: { info?: any; pdfBase64?: string; fileName?: string }) => void;
}

export default function BillOfSaleUploader({
  token,
  onUploadComplete,
}: BillOfSaleUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [vin, setVin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [repairTotal, setRepairTotal] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastRepairDoc, setLastRepairDoc] = useState<{ url: string; fileName: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const urlVin = searchParams.get('vin');
    if (urlVin) setVin(urlVin.toUpperCase());
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (lastRepairDoc?.url) URL.revokeObjectURL(lastRepairDoc.url);
    };
  }, [lastRepairDoc]);

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Choose bill-of-sale/repair file(s) first.');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: files.length });

    let successCount = 0;

    const buildFormData = (currentFile: File) => {
      const formData = new FormData();
      formData.append('file', currentFile);

      if (vin) formData.append('vin', vin.trim().toUpperCase());
      if (customerName) {
        formData.append('customerName', customerName.trim());
        formData.append('description', customerName.trim());
      }
      if (customerPhone) formData.append('phone', customerPhone.trim());
      if (customerEmail) formData.append('email', customerEmail.trim());
      if (salePrice) {
        formData.append('salePrice', salePrice.trim());
        formData.append('price', salePrice.trim());
      }
      if (repairTotal) formData.append('total', repairTotal.trim());
      return formData;
    };

    const processFile = async (currentFile: File) => {
      let lastError: Error | null = null;

      try {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            // Try full Bill-of-Sale flow first (it generates disposition-updated used form/PDF).
            // If it fails, fallback to auto endpoint for repair documents.
            let response = await fetch(apiUrl('/documents/upload-bill-of-sale'), {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: buildFormData(currentFile),
            });

            if (!response.ok) {
              response = await fetch(apiUrl('/documents/upload-auto'), {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                body: buildFormData(currentFile),
              });
            }

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.message || 'Failed to process document');
            }

            const data = await response.json();
            if (data.status !== 'success' && data.success !== true) {
              throw new Error(data.message || 'Document upload returned an error');
            }

            const looksLikeBillOfSaleResult =
              !!data?.info && (!!data?.pdfBase64 || data?.action === 'updated_inventory_and_sales' || data?.kind === 'bill_of_sale');

            if (looksLikeBillOfSaleResult) {
              onUploadComplete({
                info: data.info,
                pdfBase64: data.pdfBase64,
                fileName: data.fileName
              });

              if (data.pdfBase64 && files.length === 1) {
                downloadPdf(data.pdfBase64, data.fileName || `UsedVehicleRecord_${data.vin}.pdf`);
              }
            }

            successCount++;
            if (data?.kind === 'repair') {
              if (lastRepairDoc?.url) URL.revokeObjectURL(lastRepairDoc.url);
              setLastRepairDoc({
                url: URL.createObjectURL(currentFile),
                fileName: currentFile.name,
                mimeType: currentFile.type || 'application/octet-stream'
              });
              toast.success(`Repair bill attached to ${data.vin || 'vehicle'}`);
            } else if (looksLikeBillOfSaleResult) {
              toast.success('Bill of Sale processed successfully.');
            } else {
              toast.success('Document processed successfully.');
            }
            lastError = null;
            break;
          } catch (error: any) {
            lastError = error;
            console.warn(`Upload attempt ${attempt} failed for ${currentFile.name}:`, error);
            if (attempt >= 2) {
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        if (lastError) {
          throw lastError;
        }
      } catch (error: any) {
        console.error(error);
        toast.error(`Failed ${currentFile.name}: ${error.message}`);
      } finally {
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
    };

    for (const file of files) {
      await processFile(file);
    }

    if (successCount > 0) {
      // Refresh all relevant tables
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['registry'] });

      toast.success(`Successfully processed ${successCount} document(s).`, {
        icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
      });
    }

    setFiles([]);
    setVin('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setSalePrice('');
    setRepairTotal('');
    setLoading(false);
  };

  return (
    <div className="rounded-[24px] border border-border bg-white p-6 space-y-6 shadow-sm">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-2">
              Upload Bill Of Sale & Repair Bills
            </h3>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Upload any sale or repair document. We auto-detect type and process it correctly.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {files.length <= 1 && (
          <div className="grid gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="relative">
              <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="VIN Fallback (Optional)"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>

            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Customer Name / Job Description (Optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Contact Number (Optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Email (Optional)"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sale Price Fallback ($) (Optional)"
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Repair Total Fallback ($) (Optional)"
                type="number"
                value={repairTotal}
                onChange={(e) => setRepairTotal(e.target.value)}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-[20px] border border-border bg-muted/30 p-5 text-left transition-all hover:border-primary/40 hover:bg-white hover:shadow-md disabled:opacity-50 group"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner group-hover:scale-110 transition-transform">
              <FileUp className="h-6 w-6" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold text-foreground">
                Bill of Sale / Repair Document(s)
              </p>
              <p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
                {files.length > 0 
                  ? `${files.length} files selected` 
                  : 'Click to select or drag files'}
              </p>
            </div>
          </div>
        </button>
      </div>

      {loading && (
        <div className="space-y-2 py-2">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-black">
            <span>Processing...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-primary to-foreground transition-all duration-500 rounded-full" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        disabled={loading || files.length === 0}
        onClick={handleUpload}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-12 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            Process Documents
          </>
        )}
      </Button>

      {lastRepairDoc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.open(lastRepairDoc.url, '_blank', 'noopener,noreferrer')}
            className="w-full border-border rounded-xl h-11 text-[10px] font-black uppercase tracking-widest hover:bg-muted"
          >
            Preview Repair Doc
          </Button>
          <Button
            type="button"
            onClick={() => {
              const link = document.createElement('a');
              link.href = lastRepairDoc.url;
              link.download = lastRepairDoc.fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
          >
            Download Repair Doc
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf"
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files || []);
          setFiles(selectedFiles);
        }}
      />
    </div>
  );
}

function downloadPdf(base64: string, fileName: string) {
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
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
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
    console.error('PDF processing failed:', err);
  }
}
