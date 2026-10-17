import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLeaseActions } from '@/hooks/useLeases';
import { vehicleName } from '@/lib/vehicleAging';
import { Vehicle } from '@/types/inventory';
import { toast } from 'sonner';

interface Props {
  vehicle: Vehicle | null;
  onOpenChange: (open: boolean) => void;
}

export default function LeaseStartDialog({ vehicle, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { create } = useLeaseActions();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (vehicle) { setCustomerName(''); setCustomerPhone(''); setEndDate(''); }
  }, [vehicle]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle) return;
    try {
      const lease = await create.mutateAsync({
        vehicleId: vehicle.id,
        customerName,
        customerPhone: customerPhone || undefined,
        endDate: endDate || undefined,
      });
      onOpenChange(false);
      navigate(`/leases/${lease.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start lease');
    }
  };

  return (
    <Dialog open={!!vehicle} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Lease {vehicle ? vehicleName(vehicle) : ''}</DialogTitle>
            <DialogDescription>Next you'll photograph the vehicle before it leaves the lot.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="lease-customer">Customer name</Label>
              <Input id="lease-customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lease-phone">Phone (optional)</Label>
              <Input id="lease-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lease-end">Expected return date (optional)</Label>
              <Input id="lease-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !customerName.trim()}>Start lease</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
