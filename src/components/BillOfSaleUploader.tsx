import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  FileUp, 
  CheckCircle2, 
  FileText, 
  Loader2, 
  Fingerprint, 
  User, 
  DollarSign, 
  Phone, 
  Mail, 
  Upload, 
  X, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  Sparkles, 
  Receipt, 
  Wrench, 
  Plus 
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiUrl } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface BillOfSaleUploaderProps {
  token: string | null;
  onUploadComplete: (data: { info?: any; pdfBase64?: string; fileName?: string }) => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const urlVin = searchParams.get('vin');
    if (urlVin) {
      setVin(urlVin.toUpperCase());
      setShowOverrides(true);
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (lastRepairDoc?.url) URL.revokeObjectURL(lastRepairDoc.url);
    };
  }, [lastRepairDoc]);

  const handleFilesChosen = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`));
      const filtered = newFiles.filter(f => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...filtered];
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setFiles([]);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleFilesChosen(droppedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Choose bill-of-sale or repair file(s) first.');
      return;
    }

    setLoading(true);
    setBlockedNotice(null);
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
            let response = await fetch(apiUrl('/documents/upload-bill-of-sale'), {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: buildFormData(currentFile),
            });

            let billOfSaleError: string | null = null;
            if (!response.ok) {
              const billOfSaleBody = await response.clone().json().catch(() => null);
              billOfSaleError = billOfSaleBody?.message ?? null;
              if (billOfSaleBody?.vehicleNotInInventory && billOfSaleError) {
                setBlockedNotice(billOfSaleError);
                throw new Error(billOfSaleError);
              }

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
              throw new Error(
                billOfSaleError || errorData.message || 'Failed to process document'
              );
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
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['registry'] });

      toast.success(`Successfully processed ${successCount} document(s).`, {
        icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
      });
      setFiles([]);
    }

    setLoading(false);
  };

  const hasOverrides = !!(vin || customerName || customerPhone || customerEmail || salePrice || repairTotal);
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="rounded-[24px] border border-border bg-white p-6 space-y-6 shadow-sm flex flex-col justify-between">
      <div className="space-y-5">
        {/* Card Header with Badges */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
              <Receipt className="w-3 h-3" />
              Sales & Service
            </span>
            <span className="text-xs text-muted-foreground font-medium">Step 2 of 2</span>
          </div>
          <h3 className="text-lg font-bold text-foreground tracking-tight">
            Bills of Sale & Repair Invoices
          </h3>
          <p className="text-sm text-muted-foreground font-medium mt-1 leading-relaxed">
            Upload customer bills of sale to mark cars as sold, or mechanic invoices to track repair costs.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Bills of Sale</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Buyer Orders</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Repair Invoices</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Parts Receipts</span>
          </div>
        </div>

        {/* Vehicle Not Found Notice */}
        {blockedNotice && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Vehicle not found in inventory
              </h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setBlockedNotice(null)} 
                className="h-6 px-2 text-xs text-amber-900 hover:bg-amber-100"
              >
                Dismiss
              </Button>
            </div>
            <p className="text-xs text-amber-900/90 font-medium leading-relaxed">{blockedNotice}</p>
            <p className="text-[11px] text-amber-800/80">
              Tip: Upload the title or purchase document first in Step 1 to add the vehicle to inventory before attaching a sale or repair.
            </p>
          </div>
        )}

        {/* Dropzone Area */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !loading && fileInputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200",
            dragActive 
              ? "border-primary bg-primary/10 scale-[0.99] shadow-inner" 
              : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
            loading && "opacity-60 pointer-events-none"
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white border border-border shadow-sm flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Drop bill of sale or repair bills here, or <span className="text-primary underline underline-offset-2">browse files</span>
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                Supports PDF, JPG, PNG • AI auto-detects sale vs repair document
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-1 h-8 rounded-lg text-xs font-semibold px-4 border-border/80 hover:bg-white"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Select Documents
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf"
            onChange={(e) => {
              const selectedFiles = Array.from(e.target.files || []);
              handleFilesChosen(selectedFiles);
              e.target.value = '';
            }}
          />
        </div>

        {/* Selected Files List */}
        {files.length > 0 && (
          <div className="space-y-2.5 rounded-2xl border border-border/60 bg-muted/30 p-3.5">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground pb-2 border-b border-border/40">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Ready to Process ({files.length} file{files.length === 1 ? '' : 's'})
              </span>
              <div className="flex items-center gap-2">
                <span>{formatFileSize(totalBytes)}</span>
                <button
                  type="button"
                  onClick={clearAllFiles}
                  disabled={loading}
                  className="text-muted-foreground hover:text-destructive text-xs transition-colors"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {files.map((file, idx) => (
                <div 
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between p-2 rounded-xl bg-white border border-border/60 text-xs shadow-2xs group"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-medium text-foreground truncate max-w-[200px] sm:max-w-[260px]" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processing Progress Bar */}
        {loading && (
          <div className="space-y-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex justify-between items-center text-xs text-foreground font-semibold">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                Reading document & matching vehicle...
              </span>
              <span className="text-emerald-600 font-mono">{progress.current} / {progress.total}</span>
            </div>
            <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full" 
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Extracting buyer name, price, or repair invoice details...</p>
          </div>
        )}

        {/* Optional Manual Overrides Accordion - Hidden by default for simplicity! */}
        <div className="rounded-2xl border border-border/70 bg-muted/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOverrides(!showOverrides)}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs font-bold text-foreground hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">⚙️</span>
              <span>Manual Overrides / Fallbacks (Optional)</span>
              {hasOverrides && (
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" title="Has manual override values" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-normal">
              <span>{showOverrides ? 'Hide' : 'Show'}</span>
              {showOverrides ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showOverrides && (
            <div className="p-4 pt-1 border-t border-border/50 space-y-3 animate-in fade-in slide-in-from-top-1">
              <p className="text-[11px] text-muted-foreground leading-normal">
                AI automatically extracts buyer, price, and VIN from your document. You only need these fields if your document is blurry, handwritten, or missing a VIN.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="relative">
                  <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="VIN Override"
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    className="pl-9 bg-white border-border rounded-xl h-9 text-xs"
                  />
                </div>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Customer / Mechanic Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="pl-9 bg-white border-border rounded-xl h-9 text-xs"
                  />
                </div>

                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Phone Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="pl-9 bg-white border-border rounded-xl h-9 text-xs"
                  />
                </div>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Customer Email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="pl-9 bg-white border-border rounded-xl h-9 text-xs"
                  />
                </div>

                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sale Price ($)"
                    type="number"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="pl-9 bg-white border-border rounded-xl h-9 text-xs"
                  />
                </div>

                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Repair Total ($)"
                    type="number"
                    value={repairTotal}
                    onChange={(e) => setRepairTotal(e.target.value)}
                    className="pl-9 bg-white border-border rounded-xl h-9 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Last Repair Document Preview/Download Actions */}
        {lastRepairDoc && (
          <div className="p-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
            <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Repair bill attached: {lastRepairDoc.fileName}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(lastRepairDoc.url, '_blank', 'noopener,noreferrer')}
                className="h-8 text-xs font-semibold rounded-lg bg-white border-border"
              >
                Preview Doc
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = lastRepairDoc.url;
                  link.download = lastRepairDoc.fileName;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="h-8 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Download Doc
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-4 border-t border-border/60">
        <Button
          type="button"
          disabled={loading || files.length === 0}
          onClick={handleUpload}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12 text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.99]"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing ({progress.current}/{progress.total})...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {files.length > 0 
                ? `Process Sale / Repair Documents (${files.length})` 
                : 'Select Sale or Repair Documents'}
            </>
          )}
        </Button>
      </div>
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
