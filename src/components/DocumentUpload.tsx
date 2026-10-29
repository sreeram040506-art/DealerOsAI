import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Camera, 
  Upload, 
  Loader2, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  X, 
  AlertCircle,
  FileCheck,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';
import { apiUrl } from '@/lib/api';

interface DocumentUploadProps {
  onScanComplete: (
    data: ExtractedVehicleDocumentInfo, 
    pdfData?: { base64: string; fileName: string },
    sourceBase64?: string
  ) => void;
  onViewExisting?: (id: string, vin: string) => void;
  token: string | null;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUpload({ onScanComplete, onViewExisting, token }: DocumentUploadProps) {
  const [scanning, setScanning] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [lastSuccessName, setLastSuccessName] = useState<string | null>(null);
  const [lastSuccessInfo, setLastSuccessInfo] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setScanError(null);
    setLastSuccessName(null);
    setLastSuccessInfo(null);

    if (files.length === 1) {
      await handleSingleFile(files[0]);
    } else {
      toast.info(`Processing ${files.length} documents in sequence...`);
      for (let i = 0; i < files.length; i++) {
        await handleSingleFile(files[i]);
        if (i < files.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  };

  const handleSingleFile = async (file: File) => {
    setScanning(true);
    setCurrentFileName(file.name);
    setScanError(null);
    
    // Convert to base64 for preview/storage
    const sourceBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.includes('base64,') ? base64.split('base64,')[1] : base64);
      };
      reader.readAsDataURL(file);
    });

    const formData = new FormData();
    formData.append('sourceFile', file);

    try {
      const response = await fetch(apiUrl('/documents/generate-used-vehicle-form'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.registryAdded) {
          toast.info(`${file.name}: Saved to Vehicle Database (Already in inventory)`);
          onScanComplete(
            errorData.info, 
            errorData.pdfBase64 ? { base64: errorData.pdfBase64, fileName: errorData.fileName } : undefined,
            sourceBase64
          );
          setLastSuccessName(file.name);
          setLastSuccessInfo(errorData.info ? `${errorData.info.year || ''} ${errorData.info.make || ''} ${errorData.info.model || ''}`.trim() : null);
          return;
        }
        if (response.status === 409) {
          const msg = errorData.message || 'Vehicle already exists in inventory';
          setScanError(`VIN conflict for ${file.name}: ${msg}`);
          toast.error(`VIN conflict for ${file.name}`, { description: msg });
          return;
        }
        throw new Error(errorData.message || 'Scan failed to extract vehicle details.');
      }
      
      const data = await response.json();
      if (data.duplicateVehicle) {
        toast.info(`${file.name}: Saved to Vehicle Database (Already in inventory)`);
      }
      
      if (data.info) {
        const vehicleSummary = [data.info.year, data.info.make, data.info.model].filter(Boolean).join(' ');
        setLastSuccessName(file.name);
        setLastSuccessInfo(vehicleSummary || data.info.vin || 'Vehicle details extracted');
        toast.success(`Extracted: ${vehicleSummary || file.name}`);

        onScanComplete(
          data.info, 
          data.pdfBase64 ? { base64: data.pdfBase64, fileName: data.fileName } : undefined,
          sourceBase64
        );
      }
    } catch (err: any) {
      console.error(err);
      const message = err.message || 'Failed to read document.';
      setScanError(`${file.name}: ${message}`);
      toast.error(`Scan error: ${message}`);
    } finally {
      setScanning(false);
      setCurrentFileName(null);
    }
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
    if (files.length > 0) handleFiles(files);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 via-card to-card p-5 space-y-4 shadow-sm">
      {/* Header with clear description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">AI Auto-Fill From Document</h4>
            <p className="text-xs text-muted-foreground">Upload any title, bill of sale, or auction slip to automatically populate the form</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground font-medium">
          <span className="px-2 py-0.5 rounded-md bg-muted/80 border border-border/60">✓ VIN & Specs</span>
          <span className="px-2 py-0.5 rounded-md bg-muted/80 border border-border/60">✓ Price & Date</span>
          <span className="px-2 py-0.5 rounded-md bg-muted/80 border border-border/60">✓ Seller Info</span>
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div 
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 transition-all duration-300 text-center cursor-pointer",
          dragActive 
            ? "border-primary bg-primary/10 scale-[0.99] shadow-inner" 
            : "border-border/80 bg-background/60 hover:border-primary/50 hover:bg-muted/30",
          scanning && "opacity-80 pointer-events-none bg-primary/5 border-primary/40"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !scanning && fileInputRef.current?.click()}
      >
        {scanning ? (
          <div className="flex flex-col items-center gap-3 py-3 animate-in fade-in zoom-in duration-200">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <FileText className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                AI is reading {currentFileName ? `"${currentFileName}"` : 'document'}...
              </p>
              <p className="text-xs text-muted-foreground">
                Extracting VIN, Year, Make, Model, Mileage, and Purchase Details
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                <Upload className="w-5 h-5" />
              </div>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Drag & drop your document here, or <span className="text-primary underline underline-offset-2">browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Supports PDF, JPG, PNG, DOC • Up to 25MB
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
              <Button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline" 
                size="sm"
                className="rounded-lg h-9 text-xs font-semibold px-4 border-border/80 hover:bg-muted"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Choose File
              </Button>
              
              <Button 
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold px-4 shadow-sm"
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                Take Photo
              </Button>
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input 
          type="file" 
          className="hidden" 
          ref={fileInputRef}
          accept="image/*,.pdf,.doc,.docx"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) handleFiles(files);
            // Reset input so same file can be picked again if desired
            e.target.value = '';
          }}
        />
        
        <input 
          type="file" 
          className="hidden" 
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) handleFiles(files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Success banner if a document was successfully extracted */}
      {lastSuccessName && !scanning && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold">Successfully auto-filled from: </span>
              <span className="font-mono">{lastSuccessName}</span>
              {lastSuccessInfo && <span className="ml-1 opacity-90">({lastSuccessInfo})</span>}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 text-[11px] px-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Scan another
          </Button>
        </div>
      )}

      {/* Error banner if scan encountered an issue */}
      {scanError && !scanning && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{scanError}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setScanError(null)}
            className="h-7 w-7 p-0 text-red-700 dark:text-red-300 hover:bg-red-500/20 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
