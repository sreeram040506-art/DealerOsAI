import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COST_FLAG_TEXT, type FlaggedVehicle } from '@/lib/financeReport';
import { money, vehicleLabel } from '@/lib/reportFormat';
import type { Vehicle } from '@/types/inventory';

/**
 * Lists vehicles whose purchase price looks wrong, so the figures above can be trusted or fixed.
 * Opening a vehicle lets someone enter the real price in its Edit Details form.
 */
export default function CostsToVerify({
  items,
  intro,
  onOpenVehicle,
}: {
  items: FlaggedVehicle[];
  intro: string;
  onOpenVehicle: (vehicle: Vehicle) => void;
}) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" role="alert">
      <summary className="flex cursor-pointer list-none items-start gap-2 font-semibold text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          {items.length} vehicle{items.length === 1 ? ' has' : 's have'} a purchase price to confirm.
          <span className="ml-1 font-normal text-muted-foreground">{intro} Show vehicles</span>
        </span>
      </summary>
      <ul className="mt-3 divide-y divide-amber-500/20">
        {items.map(({ vehicle, flag }) => (
          <li key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {vehicleLabel(vehicle)}
                {vehicle.stockNumber && <span className="ml-2 font-mono text-xs text-muted-foreground">#{vehicle.stockNumber}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {money(vehicle.purchase?.purchasePrice ?? vehicle.purchasePrice)} · {COST_FLAG_TEXT[flag]}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenVehicle(vehicle)}>
              Check price
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
