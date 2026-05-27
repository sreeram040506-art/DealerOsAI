import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRegistry, DocumentLog } from '@/hooks/useRegistry';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';

interface EditRegistryDialogProps {
  log: DocumentLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditRegistryDialog({ log, open, onOpenChange }: EditRegistryDialogProps) {
  const { updateLog } = useRegistry();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vin: '',
    make: '',
    model: '',
    year: '',
    color: '',
    mileage: '',
    titleNumber: '',
    purchasedFrom: '',
    purchaseDate: '',
    sellerAddress: '',
    sellerCity: '',
    sellerState: '',
    sellerZip: '',
    disposedTo: '',
    disposedAddress: '',
    disposedCity: '',
    disposedState: '',
    disposedZip: '',
    disposedDate: '',
    disposedPrice: '',
    disposedOdometer: '',
    disposedDlNumber: '',
    disposedDlState: '',
  });

  useEffect(() => {
    if (log) {
      setFormData({
        vin: log.vin || '',
        make: log.make || '',
        model: log.model || '',
        year: log.year || '',
        color: log.color || '',
        mileage: log.mileage || '',
        titleNumber: log.titleNumber || '',
        purchasedFrom: log.purchasedFrom || '',
        purchaseDate: log.purchaseDate ? log.purchaseDate.split('T')[0] : '',
        sellerAddress: log.sellerAddress || '',
        sellerCity: log.sellerCity || '',
        sellerState: log.sellerState || '',
        sellerZip: log.sellerZip || '',
        disposedTo: log.disposedTo || '',
        disposedAddress: log.disposedAddress || '',
        disposedCity: log.disposedCity || '',
        disposedState: log.disposedState || '',
        disposedZip: log.disposedZip || '',
        disposedDate: log.disposedDate ? log.disposedDate.split('T')[0] : '',
        disposedPrice: log.disposedPrice || '',
        disposedOdometer: log.disposedOdometer || '',
        disposedDlNumber: log.disposedDlNumber || '',
        disposedDlState: log.disposedDlState || '',
      });
    }
  }, [log]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!log) return;

    setLoading(true);
    try {
      await updateLog({
        id: log.id,
        ...formData
      });
      toast.success('Document updated and PDF regenerated.');
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to update document.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border text-foreground max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-foreground">Edit Document Details</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Updating these details will automatically regenerate the associated PDF document.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">VIN</Label>
              <Input
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Year</Label>
              <Input
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Make</Label>
              <Input
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Model</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Color</Label>
              <Input
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Mileage</Label>
              <Input
                value={formData.mileage}
                onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Title Number</Label>
            <Input
              value={formData.titleNumber}
              onChange={(e) => setFormData({ ...formData, titleNumber: e.target.value })}
              className="bg-muted border-border text-foreground"
              placeholder="e.g. TITLE123456"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Purchased From</Label>
            <Input
              value={formData.purchasedFrom}
              onChange={(e) => setFormData({ ...formData, purchasedFrom: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Purchase Date</Label>
            <Input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Seller Address</Label>
            <Input
              value={formData.sellerAddress}
              onChange={(e) => setFormData({ ...formData, sellerAddress: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-1">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Seller City</Label>
              <Input
                value={formData.sellerCity}
                onChange={(e) => setFormData({ ...formData, sellerCity: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">State</Label>
              <Input
                value={formData.sellerState}
                onChange={(e) => setFormData({ ...formData, sellerState: e.target.value })}
                className="bg-muted border-border text-foreground"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Zip</Label>
              <Input
                value={formData.sellerZip}
                onChange={(e) => setFormData({ ...formData, sellerZip: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="pt-4 pb-2 border-t border-border">
            <h4 className="text-sm font-semibold text-primary uppercase tracking-widest">Sale / Disposition Details</h4>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Disposed To (Buyer)</Label>
            <Input
              value={formData.disposedTo}
              onChange={(e) => setFormData({ ...formData, disposedTo: e.target.value })}
              className="bg-muted border-border text-foreground"
              placeholder="Customer Name"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Buyer Address</Label>
            <Input
              value={formData.disposedAddress}
              onChange={(e) => setFormData({ ...formData, disposedAddress: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-1">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">City</Label>
              <Input
                value={formData.disposedCity}
                onChange={(e) => setFormData({ ...formData, disposedCity: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">State</Label>
              <Input
                value={formData.disposedState}
                onChange={(e) => setFormData({ ...formData, disposedState: e.target.value })}
                className="bg-muted border-border text-foreground"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Zip</Label>
              <Input
                value={formData.disposedZip}
                onChange={(e) => setFormData({ ...formData, disposedZip: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Sale Date</Label>
              <Input
                type="date"
                value={formData.disposedDate}
                onChange={(e) => setFormData({ ...formData, disposedDate: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Sale Price</Label>
              <Input
                value={formData.disposedPrice}
                onChange={(e) => setFormData({ ...formData, disposedPrice: e.target.value })}
                className="bg-muted border-border text-foreground"
                placeholder="$"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Disposal Odometer</Label>
              <Input
                value={formData.disposedOdometer}
                onChange={(e) => setFormData({ ...formData, disposedOdometer: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">DL Number</Label>
              <Input
                value={formData.disposedDlNumber}
                onChange={(e) => setFormData({ ...formData, disposedDlNumber: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary text-black hover:bg-primary/90 font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
