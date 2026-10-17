import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import LeasePhotoGrid from '@/components/LeasePhotoGrid';
import LeaseComparison from '@/components/LeaseComparison';
import { Button } from '@/components/ui/button';
import { useLease, useLeaseActions, useLeasePhotos } from '@/hooks/useLeases';
import { vehicleName } from '@/lib/vehicleAging';
import { toast } from 'sonner';

export default function LeaseDetail() {
  const { id } = useParams();
  const { data: lease, isLoading, isError, refetch } = useLease(id);
  const { data: photos = [] } = useLeasePhotos(id);
  const { markReturned } = useLeaseActions();

  const pickup = photos.filter((p) => p.phase === 'PICKUP');
  const returned = photos.filter((p) => p.phase === 'RETURN');

  return (
    <AppLayout>
      <div className="space-y-8">
        <Link to="/leases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> All leases
        </Link>

        {isError ? (
          <QueryErrorState title="Could not load leases" description="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading || !lease ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{vehicleName(lease.vehicle)}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Leased to {lease.customerName}{lease.customerPhone ? ` · ${lease.customerPhone}` : ''} · {lease.status === 'ACTIVE' ? 'out since' : 'was out since'} {new Date(lease.startDate).toLocaleDateString()}
                </p>
              </div>
              {lease.status === 'ACTIVE' ? (
                <Button
                  disabled={markReturned.isPending || !returned.length}
                  title={returned.length ? undefined : 'Add at least one return photo first'}
                  onClick={() => markReturned.mutate(lease.id, { onError: (e) => toast.error(e.message) })}
                >
                  Mark as returned
                </Button>
              ) : (
                <span className="text-sm font-semibold text-emerald-600">Returned {lease.returnedAt ? new Date(lease.returnedAt).toLocaleDateString() : ''}</span>
              )}
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">1. Condition at pickup</h2>
              <p className="text-sm text-muted-foreground">Photograph each side, corner and wheel before the customer drives away. Shoot wheels close enough to show the rim.</p>
              <LeasePhotoGrid leaseId={lease.id} phase="PICKUP" photos={pickup} disabled={lease.status !== 'ACTIVE'} />
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">2. Condition at return</h2>
              <p className="text-sm text-muted-foreground">Repeat the same shots from the same positions when the vehicle comes back.</p>
              <LeasePhotoGrid leaseId={lease.id} phase="RETURN" photos={returned} />
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">3. Before / after comparison</h2>
              <LeaseComparison pickup={pickup} returned={returned} />
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
