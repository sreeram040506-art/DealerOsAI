import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-utils';
import { formatCurrency } from '@/lib/utils';
import { formatSafeDate } from '@/lib/dateUtils';
import { useVehiclePriceSuggestions } from '@/hooks/usePriceSuggestions';

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

/** Market price check for one unsold vehicle: shows the suggestion and lets an owner or manager act on it. */
export default function PriceSuggestionCard({ vehicleId }: { vehicleId: string }) {
  const { allowed, latest, isLoading, check, isChecking, apply, isApplying, dismiss, isDismissing } = useVehiclePriceSuggestions(vehicleId);
  if (!allowed) return null;

  const run = async () => {
    try {
      const result = await check();
      toast.success(result.status === 'PENDING' ? 'Market check done: a new price is suggested.' : result.status === 'IN_LINE' ? 'Market check done: the price is in line.' : 'Market check done: not enough listings were found.');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Market check failed.'); }
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast.success(done); } catch (err) { toast.error(err instanceof Error ? err.message : 'That did not work.'); }
  };

  const pending = latest?.status === 'PENDING' ? latest : undefined;
  const checkButton = (
    <Button type="button" variant="outline" size="sm" onClick={run} disabled={isChecking} className="shrink-0">
      {isChecking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}{isChecking ? 'Searching…' : 'Check market now'}
    </Button>
  );

  if (!pending) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          {isLoading ? 'Loading price check…' : latest ? `Last market check ${formatSafeDate(latest.createdAt)}: ${latest.status === 'IN_LINE' ? 'price is in line with the market.' : latest.status === 'NO_DATA' ? 'not enough listings found.' : latest.status === 'APPLIED' ? 'new price applied.' : 'suggestion dismissed.'}` : 'No market price check yet.'}
        </p>
        {checkButton}
      </div>
    );
  }

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4" aria-label="Market price suggestion">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400"><Sparkles className="h-4 w-4" aria-hidden="true" /> Price check — {pending.daysOnLot} days on the lot</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
            {pending.currentPrice ? <span className="text-muted-foreground line-through decoration-1">{formatCurrency(pending.currentPrice)}</span> : <span className="text-base font-medium text-muted-foreground">No price set</span>}
            <span className="mx-2 text-muted-foreground">→</span>{formatCurrency(pending.suggestedPrice ?? 0)}
          </p>
        </div>
        {checkButton}
      </div>
      <p className="text-sm text-foreground">{pending.reason}</p>
      {pending.belowCost && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs font-semibold text-destructive" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> This price is below what you have invested in the vehicle.</p>
      )}
      {!!pending.comparables?.length && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-muted-foreground">See the {pending.comparables.length} listings used</summary>
          <ul className="mt-2 space-y-1">
            {pending.comparables.map((c) => (
              <li key={c.url} className="flex items-center justify-between gap-3">
                <a href={safeHref(c.url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{c.source}{c.mileage ? ` · ${c.mileage.toLocaleString()} mi` : ''}</span>
                </a>
                <span className="font-bold tabular-nums text-foreground">{formatCurrency(c.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Prices come from public web listings found by a search and can be out of date. Check them before you change a price.</p>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isApplying || isDismissing} onClick={() => act(() => apply(pending.id), `Price changed to ${formatCurrency(pending.suggestedPrice ?? 0)}.`)} className="font-bold">
          {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply {formatCurrency(pending.suggestedPrice ?? 0)}
        </Button>
        <Button type="button" variant="outline" disabled={isApplying || isDismissing} onClick={() => act(() => dismiss(pending.id), 'Suggestion dismissed.')}>Dismiss</Button>
      </div>
    </section>
  );
}
