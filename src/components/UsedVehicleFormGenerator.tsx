import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  FileUp, 
  CheckCircle2, 
  Upload, 
  X, 
  FileText, 
  Loader2, 
  AlertCircle, 
  Sparkles,
  Camera,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface UsedVehicleFormGeneratorProps {
  token: string | null;
  onScanComplete: (data: { info: ExtractedVehicleDocumentInfo; pdfBase64: string; fileName: string }) => void;
}

interface GenerateUsedVehicleResponse {
  success: boolean;
  info: ExtractedVehicleDocumentInfo;
  fileName: string;
  pdfBase64: string;
  duplicateVehicle?: boolean;
  registryAdded?: boolean;
  inventoryAdded?: boolean;
  message?: string;
  warnings?: {
    addressMissing?: boolean;
    makeMissing?: boolean;
    modelMissing?: boolean;
    yearMissing?: boolean;
    priceMissing?: boolean;
    vinChecksumInvalid?: boolean;
    aiUnavailable?: boolean;
  };
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UsedVehicleFormGenerator({
  token,
  onScanComplete,
}: UsedVehicleFormGeneratorProps) {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [pushToInventory, setPushToInventory] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [batchFailures, setBatchFailures] = useState<{ fileName: string; reason: string; fileObj?: File }[]>([]);

  const handleFilesChosen = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setSourceFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`));
      const filtered = newFiles.filter(f => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...filtered];
    });
  };

  const removeFile = (index: number) => {
    setSourceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSourceFiles([]);
    setBatchFailures([]);
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
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFilesChosen(files);
  };

  const handleGenerate = async (shouldPushToInventory: boolean) => {
    const filesToProcess = [...sourceFiles];
    if (filesToProcess.length === 0) {
      toast.error('Please choose at least one document to process.');
      return;
    }

    setLoading(true);
    setBatchFailures([]);
    setProgress({ current: 0, total: filesToProcess.length });

    let successCount = 0;
    let failCount = 0;
    const failures: { fileName: string; reason: string; fileObj?: File }[] = [];

    const processFile = async (file: File) => {
      setCurrentProcessingFile(file.name);
      const formData = new FormData();
      formData.append('sourceFile', file);
      formData.append('pushToInventory', String(shouldPushToInventory));

      try {
        const response = await fetch(apiUrl('/documents/generate-used-vehicle-form'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        let data;
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          if (response.status === 409 && errorData.registryAdded) {
            data = errorData;
            toast.info(`${file.name}: Saved to Vehicle Database (Already in inventory)`);
          } else {
            throw new Error(errorData.message || 'Failed to generate record from document');
          }
        } else {
          data = (await response.json()) as GenerateUsedVehicleResponse;
          if (data.duplicateVehicle) {
            toast.info(`${file.name}: Saved to Vehicle Database (Already in inventory)`);
          }
        }
        
        if (data.warnings?.aiUnavailable) {
          toast.warning(`${file.name}: AI extraction unavailable, read with OCR only. Verify fields.`);
        }
        if (data.warnings?.addressMissing) {
          toast.warning(`${file.name}: Address could not be reliably extracted. Review before saving.`);
        }
        if (data.warnings?.vinChecksumInvalid) {
          toast.warning(`${file.name}: VIN "${data.info?.vin}" failed checksum validation.`);
        }

        onScanComplete({
          info: data.info,
          pdfBase64: data.pdfBase64,
          fileName: data.fileName
        });

        if (filesToProcess.length === 1 && data.pdfBase64) {
          downloadPdf(data.pdfBase64, data.fileName);
        }

        successCount++;
      } catch (error: any) {
        console.error(error);
        failCount++;
        failures.push({ fileName: file.name, reason: error?.message || 'Processing failed', fileObj: file });
        toast.error(`Failed ${file.name}: ${error.message}`);
      } finally {
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
    };

    for (const file of filesToProcess) {
      await processFile(file);
      if (filesToProcess.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} vehicle document(s).`, {
        icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
      });
      const failedNames = new Set(failures.map(f => f.fileName));
      setSourceFiles(prev => prev.filter(f => failedNames.has(f.name)));
    }

    if (failCount > 0) {
      setBatchFailures(failures);
      toast.error(
        `${failCount} of ${filesToProcess.length} file(s) could not be processed. Review and retry below.`,
        { duration: 8000 }
      );
    }

    setLoading(false);
    setCurrentProcessingFile(null);
  };

  const retryFailures = () => {
    const retryFiles = batchFailures.map(f => f.fileObj).filter(Boolean) as File[];
    if (retryFiles.length > 0) {
      setSourceFiles(retryFiles);
      setBatchFailures([]);
    }
  };

  const totalBytes = sourceFiles.reduce((acc, file) => acc + file.size, 0);

  return (
    <div className="rounded-[20px] sm:rounded-[24px] border border-border bg-white p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-xs flex flex-col justify-between">
      <div className="space-y-4 sm:space-y-5">
        {/* Card Header with Badges */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">
              <FileUp className="w-3 h-3" />
              Vehicle Intake
            </span>
            <span className="text-[11px] sm:text-xs text-muted-foreground font-medium">Step 1 of 2</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            Purchase Documents & Titles
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1 leading-relaxed">
            Upload purchase documents to extract vehicle specs and generate state Used Vehicle Records.
          </p>
          <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-2.5">
            <span className="text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Titles</span>
            <span className="text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Auction Slips</span>
            <span className="text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">Dealer Invoices</span>
            <span className="text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">MSO / Certificates</span>
          </div>
        </div>

        {/* Batch Failures Alert */}
        {batchFailures.length > 0 && (
          <div className="rounded-2xl border border-red-300 bg-red-50/80 p-3.5 sm:p-4 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-900 font-bold text-xs uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{batchFailures.length} file(s) had issues</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setBatchFailures([])} 
                className="h-6 px-2 text-xs text-red-800 hover:bg-red-100"
              >
                Dismiss
              </Button>
            </div>
            <ul className="space-y-1 max-h-36 overflow-y-auto text-xs text-red-900">
              {batchFailures.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 font-medium">
                  <span className="font-mono text-[11px] shrink-0 font-semibold">{f.fileName}:</span>
                  <span className="text-red-800/80 truncate">{f.reason}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={retryFailures}
              disabled={loading}
              className="text-xs font-semibold h-8 bg-white border-red-200 text-red-900 hover:bg-red-100/60 w-full sm:w-auto"
            >
              Retry Failed Files
            </Button>
          </div>
        )}

        {/* Dropzone Area with Mobile Camera & Touch Optimizations */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !loading && sourceInputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-4 sm:p-6 text-center cursor-pointer transition-all duration-200",
            dragActive 
              ? "border-primary bg-primary/10 scale-[0.99] shadow-inner" 
              : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
            loading && "opacity-60 pointer-events-none"
          )}
        >
          <div className="flex flex-col items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white border border-border shadow-xs flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-foreground">
                Snap photo with camera or drop files
              </p>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium">
                Supports PDF, JPG, PNG • Batch multiple files
              </p>
            </div>

            {/* Touch Action Buttons for Mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="h-10 rounded-xl text-xs font-bold px-3 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform w-full"
              >
                <Camera className="w-4 h-4" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => sourceInputRef.current?.click()}
                className="h-10 rounded-xl text-xs font-semibold px-3 border-border hover:bg-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform w-full bg-white"
              >
                <Upload className="w-4 h-4 text-muted-foreground" />
                Browse Files
              </Button>
            </div>
          </div>

          <input
            ref={sourceInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              handleFilesChosen(files);
              e.target.value = '';
            }}
          />

          {/* Mobile Camera Input */}
          <input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              handleFilesChosen(files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Selected Files List */}
        {sourceFiles.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:p-3.5">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground pb-1.5 border-b border-border/40">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Ready to Process ({sourceFiles.length})
              </span>
              <div className="flex items-center gap-2">
                <span>{formatFileSize(totalBytes)}</span>
                <button
                  type="button"
                  onClick={clearAllFiles}
                  disabled={loading}
                  className="text-muted-foreground hover:text-destructive text-xs transition-colors p-1"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
              {sourceFiles.map((file, idx) => (
                <div 
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between p-2 rounded-xl bg-white border border-border/60 text-xs shadow-2xs group"
                >
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-medium text-foreground truncate max-w-[170px] sm:max-w-[240px]" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processing Progress Bar */}
        {loading && (
          <div className="space-y-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex justify-between items-center text-xs text-foreground font-semibold">
              <span className="flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-none">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                <span className="truncate">{currentProcessingFile ? `Processing: ${currentProcessingFile}` : 'Processing documents...'}</span>
              </span>
              <span className="text-primary font-mono shrink-0 ml-2">{progress.current} / {progress.total}</span>
            </div>
            <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 rounded-full" 
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">Extracting VIN, specs, pricing, and generating records...</p>
          </div>
        )}

        {/* Options & Configuration */}
        <div className="p-3 sm:p-3.5 rounded-2xl border border-border/70 bg-muted/20 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="push-inv-toggle" className="text-xs font-bold text-foreground cursor-pointer">
                Add directly to Active Inventory
              </Label>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-normal">
                {pushToInventory 
                  ? "✓ Adds vehicle to for-sale inventory and database" 
                  : "✓ Saves to database & PDF only (not for sale)"}
              </p>
            </div>
            <Switch
              id="push-inv-toggle"
              checked={pushToInventory}
              onCheckedChange={setPushToInventory}
              disabled={loading}
              className="shrink-0"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons - Touch Target Optimized */}
      <div className="pt-3 sm:pt-4 border-t border-border/60">
        <Button
          type="button"
          disabled={loading || sourceFiles.length === 0}
          onClick={() => handleGenerate(pushToInventory)}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 sm:h-12 text-xs font-black uppercase tracking-wider shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scanning ({progress.current}/{progress.total})...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {sourceFiles.length > 0 
                ? `Process & ${pushToInventory ? 'Add to Inventory' : 'Save Record'} (${sourceFiles.length})` 
                : 'Select Documents to Process'}
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
    toast.error('Failed to process the PDF. Please try again.');
  }
}
