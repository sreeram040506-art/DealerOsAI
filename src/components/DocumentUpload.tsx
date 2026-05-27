import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, FileText, CheckCircle2 } from 'lucide-react';
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

export default function DocumentUpload({ onScanComplete, onViewExisting, token }: DocumentUploadProps) {
  const [scanning, setScanning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    // For single file, we can still use the old logic if needed, 
    // but for bulk we'll pass the files back to the parent
    if (files.length === 1) {
      await handleSingleFile(files[0]);
    } else {
      // Process files sequentially with cooldown for API rate limiting
      toast.info(`Preparing to process ${files.length} documents...`);
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
          // It's in inventory already, but we successfully logged it to registry
          toast.info(`${file.name}: Logged to registry (Already in inventory)`);
          onScanComplete(
            errorData.info, 
            errorData.pdfBase64 ? { base64: errorData.pdfBase64, fileName: errorData.fileName } : undefined,
            sourceBase64
          );
          return;
        }
        if (response.status === 409) {
          toast.error(`VIN conflict for ${file.name}`, {
            description: errorData.message || 'Vehicle already exists in inventory',
          });
          return;
        }
        throw new Error(errorData.message || 'Scan failed');
      }
      
      const data = await response.json();
      
      if (data.info) {
        onScanComplete(
          data.info, 
          data.pdfBase64 ? { base64: data.pdfBase64, fileName: data.fileName } : undefined,
          sourceBase64
        );
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to process ${file.name}: ${err.message}`);
    } finally {
      setScanning(false);
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
    <div className="space-y-4">
      <div 
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-8 transition-all duration-300 text-center",
          dragActive ? "border-primary bg-primary/5 scale-[0.99]" : "border-border bg-muted/50 hover:border-border",
          scanning && "opacity-50 pointer-events-none"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {scanning ? (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-profit animate-spin" />
              <FileText className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-foreground font-medium">AI is reading your document...</p>
              <p className="text-muted-foreground text-sm">Extracting VIN, Price, and Vehicle info</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-center -space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center rotate-[-10deg] border border-border shadow-xl">
                <FileText className="text-muted-foreground w-6 h-6" />
              </div>
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center translate-y-[-4px] border border-primary/30 shadow-2xl z-10">
                <Upload className="text-primary w-6 h-6" />
              </div>
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center rotate-[10deg] border border-border shadow-xl">
                <Camera className="text-muted-foreground w-6 h-6" />
              </div>
            </div>
            
            <div className="space-y-1">
              <p className="text-foreground font-medium text-lg">Drop your documents here</p>
              <p className="text-muted-foreground text-sm">Select multiple files for bulk push</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button 
                onClick={() => fileInputRef.current?.click()}
                variant="outline" 
                className="bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground h-11 px-6 rounded-xl"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
              </Button>
              
              <Button 
                onClick={() => cameraInputRef.current?.click()}
                className="bg-primary hover:bg-primary-hover text-black h-11 px-6 rounded-xl font-semibold shadow-lg shadow-primary/20"
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
            </div>
          </div>
        )}

        <input 
          type="file" 
          className="hidden" 
          ref={fileInputRef}
          accept="image/*,.pdf,.doc,.docx"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) handleFiles(files);
          }}
        />
        
        {/* Special Camera Input for Mobile */}
        <input 
          type="file" 
          className="hidden" 
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) handleFiles(files);
          }}
        />
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-[13px] text-blue-400/80">
        <Loader2 className="w-3.5 h-3.5 animate-pulse" />
        <span>Optimized for high-quality PDFs and high-res mobile photos.</span>
      </div>
    </div>
  );
}
