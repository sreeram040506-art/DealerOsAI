import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileUp, CheckCircle2, Download, FileArchive, Database } from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';
import { apiUrl } from '@/lib/api';

interface UsedVehicleFormGeneratorProps {
  token: string | null;
  onScanComplete: (data: { info: ExtractedVehicleDocumentInfo; pdfBase64: string; fileName: string }) => void;
}

interface GenerateUsedVehicleResponse {
  success: boolean;
  info: ExtractedVehicleDocumentInfo;
  fileName: string;
  pdfBase64: string;
}

export default function UsedVehicleFormGenerator({
  token,
  onScanComplete,
}: UsedVehicleFormGeneratorProps) {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async (pushToInventory: boolean) => {
    if (sourceFiles.length === 0) {
      toast.error('Choose the source file(s) first.');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: sourceFiles.length });

    let successCount = 0;
    let failCount = 0;

    const processFile = async (file: File) => {
      const formData = new FormData();
      formData.append('sourceFile', file);
      formData.append('pushToInventory', String(pushToInventory));

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
          
          // If it's a 409 conflict but registry was added/updated, we treat it as a success for the record generation
          if (response.status === 409 && errorData.registryAdded) {
            data = errorData;
            toast.info(`${file.name}: Logged to registry (Vehicle already in inventory)`);
          } else {
            throw new Error(errorData.message || 'Failed to generate form');
          }
        } else {
          data = (await response.json()) as GenerateUsedVehicleResponse & { inventoryAdded?: boolean };
        }
        
        if (data.warnings?.addressMissing) {
          toast.warn(`${file.name}: Address could not be reliably extracted. Review before adding to inventory.`);
        }

        onScanComplete({ 
          info: data.info, 
          pdfBase64: data.pdfBase64, 
          fileName: data.fileName 
        });

        if (sourceFiles.length === 1) {
          downloadPdf(data.pdfBase64, data.fileName);
        }

        successCount++;
      } catch (error: any) {
        console.error(error);
        failCount++;
        toast.error(`Failed ${file.name}: ${error.message}`);
      } finally {
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
    };

    // Sequential processing with cooldown between files for API rate limit safety
    for (let i = 0; i < sourceFiles.length; i++) {
      await processFile(sourceFiles[i]);
      // Wait 1s between files to avoid NVIDIA API rate limiting
      if (i < sourceFiles.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} files.`, {
        icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
      });
    }
    
    setLoading(false);
    setSourceFiles([]);
  };

  return (
    <div className="rounded-[24px] border border-border bg-white p-6 space-y-6 shadow-sm">
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground mb-2">
          Used Vehicle Record (Bulk)
        </h3>
        <p className="text-sm text-muted-foreground font-medium leading-relaxed">
          Upload documents and we&apos;ll fill them into the blank Record sheets.
          Select multiple files for batch processing.
        </p>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => sourceInputRef.current?.click()}
        className="w-full rounded-[20px] border border-border bg-muted/30 p-5 text-left transition-all hover:border-primary/40 hover:bg-white hover:shadow-md disabled:opacity-50 group"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-border text-muted-foreground shadow-sm transition-transform group-hover:scale-105">
            <FileUp className="h-6 w-6" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold text-foreground">Record Source(s)</p>
            <p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
              {sourceFiles.length > 0 
                ? `${sourceFiles.length} files selected` 
                : 'Choose one or more documents'}
            </p>
          </div>
        </div>
      </button>

      {loading && (
        <div className="space-y-2 py-2">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-black">
            <span>Processing...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-primary transition-all duration-500 rounded-full" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={loading || sourceFiles.length === 0}
          onClick={() => handleGenerate(false)}
          className="w-full border-border rounded-xl h-12 text-[10px] font-black uppercase tracking-widest hover:bg-muted"
        >
          <FileArchive className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{loading ? 'Wait...' : 'Save to Logs'}</span>
        </Button>

        <Button
          type="button"
          disabled={loading || sourceFiles.length === 0}
          onClick={() => handleGenerate(true)}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-12 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
        >
          <Database className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{loading ? 'Wait...' : 'Add Inventory'}</span>
        </Button>
      </div>

      <input
        ref={sourceInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          setSourceFiles(files);
        }}
      />
    </div>
  );
}

function downloadPdf(base64: string, fileName: string) {
  try {
    let cleanBase64 = base64;
    // Strip prefixes if present
    if (cleanBase64.includes('base64,')) {
      cleanBase64 = cleanBase64.split('base64,')[1];
    }
    // Remove all whitespace and non-base64 chars
    cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

    // Chunked decoding for robustness with large strings
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
    
    // Explicitly add to body for cross-browser stability
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Use a very long timeout (60s) to give the PDF viewer ample time to load the blob
    // before it is revoked from memory. 
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('PDF processing failed:', err);
    toast.error('Failed to process the PDF. Please try again.');
  }
}
