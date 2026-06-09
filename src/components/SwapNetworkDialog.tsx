import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';
import { Vehicle } from '@/types/inventory';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-utils';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Building2, Car, Calendar, Coins, Loader2, Sparkles } from 'lucide-react';

interface SwapNetworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myVehicles: Vehicle[];
}

export default function SwapNetworkDialog({ open, onOpenChange, myVehicles }: SwapNetworkDialogProps) {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [selectedPartnerVehicle, setSelectedPartnerVehicle] = useState<any | null>(null);
  const [selectedMyVehicleId, setSelectedMyVehicleId] = useState<string>('cash');

  // Fetch partner aging vehicles
  const { data: partnerVehicles = [], isLoading } = useQuery({
    queryKey: ['partner-swap-network'],
    queryFn: async () => {
      const response = await apiFetch('/vehicles/swap-network', token);
      return handleApiResponse<any[]>(response, logout);
    },
    enabled: open && !!token,
  });

  // Propose Swap mutation
  const proposeMutation = useMutation({
    mutationFn: async ({ targetVehicleId, myVehicleId }: { targetVehicleId: string; myVehicleId?: string }) => {
      const response = await apiFetch('/vehicles/swap-network/propose', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetVehicleId,
          myVehicleId: myVehicleId === 'cash' ? undefined : myVehicleId,
        }),
      });
      return handleApiResponse<{ channelId: string; channelName: string }>(response, logout);
    },
    onSuccess: (data) => {
      toast.success('Swap proposal sent successfully!');
      onOpenChange(false);
      setSelectedPartnerVehicle(null);
      // Redirect directly to the trade chat channel
      navigate(`/communication?channelId=${data.channelId}`);
    },
    onError: (error) => {
      toast.error('Failed to send swap proposal.');
      console.error(error);
    }
  });

  const handlePropose = () => {
    if (!selectedPartnerVehicle) return;
    proposeMutation.mutate({
      targetVehicleId: selectedPartnerVehicle.id,
      myVehicleId: selectedMyVehicleId,
    });
  };

  const myAvailableVehicles = myVehicles.filter(v => v.status === 'Available');

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) setSelectedPartnerVehicle(null); }}>
      <DialogContent className="max-w-3xl bg-card border-border max-h-[85vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-foreground">Inter-Dealership Swap Network</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                Trade your aging inventory or acquire fresh units directly with partner dealerships.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {selectedPartnerVehicle ? (
          /* Propose Swap Screen */
          <div className="space-y-5 py-4">
            <div className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">Trading Target</span>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-base text-foreground leading-snug">
                    {selectedPartnerVehicle.year} {selectedPartnerVehicle.make} {selectedPartnerVehicle.model}
                  </h4>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedPartnerVehicle.vin}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-destructive bg-destructive/10 border border-destructive/20 px-2.5 py-0.5 rounded-full">
                    {selectedPartnerVehicle.daysInInventory} Days Aging
                  </span>
                  <p className="text-xs font-semibold text-muted-foreground mt-1.5">Owner: {selectedPartnerVehicle.dealership.name}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">Select a vehicle from your lot to trade:</label>
              <select
                value={selectedMyVehicleId}
                onChange={(e) => setSelectedMyVehicleId(e.target.value)}
                className="w-full bg-card text-foreground font-bold p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:outline-none"
              >
                <option value="cash">Open Discussion / Direct Purchase Offer</option>
                {myAvailableVehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model} ({v.color}, {v.mileage.toLocaleString()} mi) - Cost Basis: ${(((v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0)) + ((v.repairCost || v.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-11 text-sm font-bold"
                onClick={() => setSelectedPartnerVehicle(null)}
              >
                Back to List
              </Button>
              <Button
                className="flex-1 rounded-xl h-11 text-sm font-bold gap-2"
                onClick={handlePropose}
                disabled={proposeMutation.isPending}
              >
                {proposeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending Proposal...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Send Swap Offer
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Swap Marketplace Screen */
          <div className="space-y-4 py-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Scanning partner lots...</p>
              </div>
            ) : partnerVehicles.length > 0 ? (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                {partnerVehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-4 group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase border border-destructive/20 bg-destructive/5 text-destructive">
                          {vehicle.daysInInventory} Days
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
                          <Building2 className="w-3.5 h-3.5" />
                          {vehicle.dealership.name}
                        </div>
                      </div>
                      <h3 className="font-bold text-base text-foreground tracking-tight group-hover:text-primary transition-colors">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {vehicle.color} · {vehicle.mileage.toLocaleString()} mi · VIN: {vehicle.vin}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Est. Cost Basis</p>
                        <p className="text-sm font-black text-foreground tabular-nums">${vehicle.totalCostBasis.toLocaleString()}</p>
                      </div>
                      <Button
                        size="sm"
                        className="rounded-lg h-9 font-bold text-xs gap-1.5"
                        onClick={() => setSelectedPartnerVehicle(vehicle)}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Propose Trade
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/10 border border-dashed border-border rounded-xl">
                <Car className="w-10 h-10 text-muted-foreground/45 mb-2" />
                <h3 className="font-bold text-sm text-foreground">No Partner Stock Available</h3>
                <p className="text-muted-foreground text-xs max-w-sm mt-1">
                  There are currently no aging 90+ days vehicles listed on other dealership platforms matching the swap network pool.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
