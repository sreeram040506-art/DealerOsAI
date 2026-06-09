import { useState } from 'react';
import { Vehicle } from '@/types/inventory';
import { cn } from '@/lib/utils';
import { 
  ArrowLeft, 
  ArrowRight, 
  Clock, 
  AlertTriangle, 
  FileText, 
  DollarSign, 
  Car, 
  Wrench, 
  Paintbrush, 
  ClipboardCheck, 
  Camera, 
  CheckSquare, 
  Coins 
} from 'lucide-react';
import { toast } from '@/components/ui/toast-utils';

interface ReconKanbanBoardProps {
  vehicles: Vehicle[];
  updateVehicle: (updates: Partial<Vehicle> & { id: string }) => Promise<any>;
  onSelectVehicle: (vehicle: Vehicle) => void;
}

const STAGES = [
  'Acquired',
  'Detailing',
  'Inspection',
  'Mechanical Repairs',
  'Photo Ready',
  'Listed'
];

const STAGE_ICONS: Record<string, any> = {
  'Acquired': Car,
  'Detailing': Paintbrush,
  'Inspection': ClipboardCheck,
  'Mechanical Repairs': Wrench,
  'Photo Ready': Camera,
  'Listed': CheckSquare,
};

const STAGE_COLORS: Record<string, string> = {
  'Acquired': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'Detailing': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'Inspection': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  'Mechanical Repairs': 'bg-red-500/10 text-red-500 border-red-500/20',
  'Photo Ready': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  'Listed': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

export default function ReconKanbanBoard({ vehicles, updateVehicle, onSelectVehicle }: ReconKanbanBoardProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filter out Sold or Returned vehicles from the Recon Board
  const activeVehicles = vehicles.filter(v => v.status !== 'Sold' && v.status !== 'Returned');

  const getVehicleStage = (vehicle: Vehicle): string => {
    const stage = vehicle.reconStage;
    if (!stage || stage === 'None' || !STAGES.includes(stage)) {
      return 'Acquired';
    }
    return stage;
  };

  const handleMoveStage = async (vehicle: Vehicle, direction: 'left' | 'right' | string) => {
    let targetStage = '';
    
    if (direction === 'left' || direction === 'right') {
      const currentStage = getVehicleStage(vehicle);
      const currentIndex = STAGES.indexOf(currentStage);
      const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
      
      if (newIndex < 0 || newIndex >= STAGES.length) return;
      targetStage = STAGES[newIndex];
    } else {
      targetStage = direction;
    }

    try {
      setUpdatingId(vehicle.id);
      
      // If moving to Listed, also check if status should be updated to Available
      const updates: Partial<Vehicle> & { id: string } = {
        id: vehicle.id,
        reconStage: targetStage,
      };

      await updateVehicle(updates);
      toast.success(`${vehicle.make} ${vehicle.model} moved to ${targetStage}`);
    } catch (error) {
      toast.error('Failed to update vehicle stage');
      console.error(error);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-6 -mx-4 px-4 custom-scrollbar">
      {STAGES.map((stage) => {
        const stageVehicles = activeVehicles.filter(v => getVehicleStage(v) === stage);
        const IconComponent = STAGE_ICONS[stage] || Car;
        const colorStyles = STAGE_COLORS[stage] || '';

        return (
          <div key={stage} className="min-w-[280px] flex flex-col bg-muted/20 border border-border/40 rounded-2xl p-3 h-[calc(100vh-280px)] min-h-[500px]">
            {/* Stage Header */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <div className={cn("p-1.5 rounded-lg border", colorStyles)}>
                  <IconComponent className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-foreground tracking-tight">{stage}</h3>
              </div>
              <span className="text-xs font-semibold text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                {stageVehicles.length}
              </span>
            </div>

            {/* Stage Cards Column */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {stageVehicles.map((vehicle) => {
                // Calculate costs
                const purchasePrice = vehicle.purchasePrice || vehicle.purchase?.purchasePrice || 0;
                const transportCost = vehicle.transportCost || vehicle.purchase?.transportCost || 0;
                const partsCost = vehicle.repairs?.reduce((s, r) => s + (r.partsCost || 0), 0) || 0;
                const laborCost = vehicle.repairs?.reduce((s, r) => s + (r.laborCost || 0), 0) || 0;
                const totalCostBasis = purchasePrice + transportCost + partsCost + laborCost;

                // Calculate days in recon (since purchase date)
                const purchaseDate = vehicle.purchaseDate ? new Date(vehicle.purchaseDate) : new Date(vehicle.createdAt);
                const daysInRecon = Math.floor((Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
                const isOverdue = daysInRecon >= 7 && stage !== 'Listed';

                const isUpdating = updatingId === vehicle.id;

                return (
                  <div
                    key={vehicle.id}
                    className={cn(
                      "p-4 rounded-xl bg-card border shadow-sm transition-all hover:shadow-md hover:border-primary/30 cursor-pointer relative group",
                      isOverdue ? "border-destructive/40 bg-destructive/5 hover:border-destructive" : "border-border/60",
                      isUpdating && "opacity-50 pointer-events-none"
                    )}
                    onClick={() => onSelectVehicle(vehicle)}
                  >
                    {/* Overdue Alert */}
                    {isOverdue && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-md mb-2.5 w-max">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Aging Recon: {daysInRecon} Days
                      </div>
                    )}

                    {/* Vehicle Header */}
                    <div>
                      <h4 className="font-bold text-sm text-foreground leading-tight tracking-tight group-hover:text-primary transition-colors">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </h4>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{vehicle.vin}</p>
                    </div>

                    {/* Cost Basis Breakdown */}
                    <div className="mt-3 pt-3 border-t border-border/40 space-y-1 text-[11px]">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Purchase Price:</span>
                        <span className="font-semibold tabular-nums text-foreground">${purchasePrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Transport Cost:</span>
                        <span className="font-semibold tabular-nums text-foreground">${transportCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Parts / Labor:</span>
                        <span className="font-semibold tabular-nums text-foreground">${partsCost.toLocaleString()} / ${laborCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-primary font-bold border-t border-dashed border-border/50 pt-1 mt-1 text-xs">
                        <span>Total Basis:</span>
                        <span className="tabular-nums">${totalCostBasis.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Card Actions (Stage Transfer) */}
                    <div className="mt-4 flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleMoveStage(vehicle, 'left')}
                        disabled={STAGES.indexOf(getVehicleStage(vehicle)) === 0}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:pointer-events-none"
                        title="Move Stage Left"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      <select
                        value={getVehicleStage(vehicle)}
                        onChange={(e) => handleMoveStage(vehicle, e.target.value)}
                        className="bg-muted text-[10px] font-bold uppercase py-1 px-1.5 rounded-md border border-border/55 focus:outline-none flex-1 max-w-[150px] text-center"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleMoveStage(vehicle, 'right')}
                        disabled={STAGES.indexOf(getVehicleStage(vehicle)) === STAGES.length - 1}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:pointer-events-none"
                        title="Move Stage Right"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {stageVehicles.length === 0 && (
                <div className="h-32 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-xl bg-muted/5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Empty stage</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
