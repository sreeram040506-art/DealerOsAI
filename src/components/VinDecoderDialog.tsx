import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Camera } from 'lucide-react';
import { useRef } from 'react';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl, handleApiResponse } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';

export default function VinDecoderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { token, logout } = useAuth();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDecode = async (vinToDecode?: string) => {
    const targetVin = vinToDecode || vin;
    if (!targetVin || targetVin.length !== 17) {
      toast.error('Please enter a valid 17-character VIN.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(apiUrl(`/vehicles/vin-decode/${targetVin}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await handleApiResponse(response, logout);
      setResult(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to decode VIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    toast.info('Scanning document for VIN...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(apiUrl('/documents/scan-document'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to scan document');
      }

      const data = await response.json();
      if (data.success && data.info?.vin) {
        toast.success('VIN extracted successfully!');
        setVin(data.info.vin);
        handleDecode(data.info.vin);
      } else {
        toast.error('Could not find a valid VIN in the image.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error scanning image.');
    } finally {
      setScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Standalone VIN Decoder</DialogTitle>
          <DialogDescription>
            Quickly look up vehicle details using the official NHTSA database without adding it to your inventory.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-2">
            <Input 
              placeholder="Enter 17-character VIN" 
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
              maxLength={17}
              className="font-mono uppercase h-11"
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()} 
              disabled={loading || scanning} 
              className="h-11 px-3"
              title="Scan with Camera"
            >
              {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            </Button>
            <Button onClick={() => handleDecode()} disabled={loading || vin.length !== 17 || scanning} className="h-11 px-4">
              {loading && !scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            </Button>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            capture="environment" 
            onChange={handleFileChange} 
          />

          {result && (
            <div className="bg-muted p-4 rounded-xl space-y-3 mt-2 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div className="text-muted-foreground">Year</div>
                <div className="font-bold text-right text-foreground">{result.year || '—'}</div>
                
                <div className="text-muted-foreground">Make</div>
                <div className="font-bold text-right text-foreground">{result.make || '—'}</div>
                
                <div className="text-muted-foreground">Model</div>
                <div className="font-bold text-right text-foreground">{result.model || '—'}</div>
                
                <div className="text-muted-foreground">Body Class</div>
                <div className="font-medium text-right text-foreground text-xs">{result.bodyClass || '—'}</div>
                
                <div className="text-muted-foreground">Engine</div>
                <div className="font-medium text-right text-foreground text-xs">{result.engine || '—'}</div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
