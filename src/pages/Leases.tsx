import { Link } from 'react-router-dom';
import { KeyRound, ChevronRight } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import { useLeases } from '@/hooks/useLeases';
import { vehicleName } from '@/lib/vehicleAging';
import { cn } from '@/lib/utils';

export default function Leases() {
  const { data: leases, isLoading, isError, refetch } = useLeases();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="w-6 h-6" /> Leases</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start a lease from Inventory. Photograph the vehicle at pickup and again at return to spot new damage.
          </p>
        </div>

        {isError ? (
          <QueryErrorState title="Could not load leases" description="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !leases?.length ? (
          <p className="text-sm text-muted-foreground">No leases yet. Open Inventory and press Lease on a vehicle.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card/60">
            {leases.map((l) => (
              <li key={l.id}>
                <Link to={`/leases/${l.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{vehicleName(l.vehicle)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.customerName} · since {new Date(l.startDate).toLocaleDateString()}
                      {l.returnedAt ? ` · returned ${new Date(l.returnedAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                      'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                      l.status === 'ACTIVE' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
                    )}>
                      {l.status === 'ACTIVE' ? 'Out on lease' : 'Returned'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
