import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Download } from 'lucide-react';

interface DocumentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentBase64: string | null;
  vehicleName: string;
  documentType: string;
}

export default function DocumentViewerDialog({ open, onOpenChange, documentBase64, vehicleName, documentType }: DocumentViewerDialogProps) {
  if (!documentBase64) return null;

  // Determine if the base64 is a PDF or image
  const isPdf = documentBase64.startsWith('JVBER') || documentBase64.startsWith('data:application/pdf');
  
  const dataUrl = isPdf
    ? `data:application/pdf;base64,${documentBase64}`
    : `data:image/jpeg;base64,${documentBase64}`;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${vehicleName.replace(/\s+/g, '_')}_${documentType.replace(/\s+/g, '_')}.${isPdf ? 'pdf' : 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-card border-border text-foreground p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between pr-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-display font-bold">{vehicleName}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{documentType}</DialogDescription>
              </div>
            </div>
            <Button onClick={handleDownload} variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10 mt-1">
              <Download className="w-3.5 h-3.5 mr-2" /> Download
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto p-1" style={{ height: '75vh' }}>
          {isPdf ? (
            <iframe 
              src={dataUrl} 
              className="w-full h-full rounded-lg border border-border"
              title="Document Preview"
            />
          ) : (
            <img 
              src={dataUrl} 
              alt={`${vehicleName} - ${documentType}`}
              className="w-full h-auto rounded-lg"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
