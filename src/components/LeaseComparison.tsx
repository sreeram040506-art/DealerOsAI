import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { LEASE_ANGLES } from '@/lib/leaseAngles';
import { comparePhotos, ComparisonResult } from '@/lib/damageCompare';
import { LeasePhoto } from '@/hooks/useLeases';
import { cn } from '@/lib/utils';

const BOX_STYLE = {
  minor: 'border-yellow-400 bg-yellow-400/15',
  moderate: 'border-orange-500 bg-orange-500/15',
  major: 'border-red-500 bg-red-500/20',
} as const;

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; result: ComparisonResult };

export default function LeaseComparison({ pickup, returned }: { pickup: LeasePhoto[]; returned: LeasePhoto[] }) {
  const pairs = LEASE_ANGLES.flatMap(({ key, label }) => {
    const before = pickup.find((p) => p.angle === key);
    const after = returned.find((p) => p.angle === key);
    return before && after ? [{ key, label, before, after }] : [];
  });
  const [results, setResults] = useState<Record<string, State>>({});

  // Re-run only for pairs whose photos changed (photo ids change on every re-upload).
  const signature = pairs.map((p) => `${p.key}:${p.before.id}:${p.after.id}`).join('|');
  useEffect(() => {
    let cancelled = false;
    setResults({});
    for (const p of pairs) {
      setResults((r) => ({ ...r, [p.key]: { status: 'loading' } }));
      comparePhotos(p.before.dataUrl, p.after.dataUrl)
        .then((result) => !cancelled && setResults((r) => ({ ...r, [p.key]: { status: 'done', result } })))
        .catch((e) => !cancelled && setResults((r) => ({ ...r, [p.key]: { status: 'error', message: e.message } })));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!pairs.length) {
    return <p className="text-sm text-muted-foreground">Add a return photo for any angle that has a pickup photo to compare them here.</p>;
  }

  const flagged = pairs.filter((p) => {
    const s = results[p.key];
    return s?.status === 'done' && s.result.regions.length > 0;
  }).length;
  const allDone = pairs.every((p) => results[p.key]?.status === 'done');

  return (
    <div className="space-y-4">
      {allDone && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl border p-3 text-sm font-medium',
          flagged ? 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        )}>
          {flagged ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {flagged ? `Possible new damage in ${flagged} of ${pairs.length} compared angles — review the highlighted areas.` : `No changes detected in ${pairs.length} compared angles.`}
        </div>
      )}

      {pairs.map(({ key, label, before, after }) => {
        const s = results[key];
        const result = s?.status === 'done' ? s.result : null;
        return (
          <div key={key} className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">{label}</h3>
              {s?.status === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {result && (
                <span className={cn('text-xs font-semibold', result.regions.length ? 'text-orange-600' : 'text-emerald-600')}>
                  {result.regions.length ? `${result.regions.length} area${result.regions.length > 1 ? 's' : ''} flagged` : 'No change'}
                </span>
              )}
              {s?.status === 'error' && <span className="text-xs text-destructive">{s.message}</span>}
            </div>
            {result?.warning && <p className="text-xs text-amber-600">{result.warning}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <figure className="space-y-1">
                <img src={before.dataUrl} alt={`${label} at pickup`} className="w-full rounded-lg aspect-[3/2] object-cover" />
                <figcaption className="text-[11px] text-muted-foreground">At pickup</figcaption>
              </figure>
              <figure className="space-y-1">
                <div className="relative">
                  <img src={after.dataUrl} alt={`${label} at return`} className="w-full rounded-lg aspect-[3/2] object-cover" />
                  {result?.regions.map((r, i) => (
                    <div
                      key={i}
                      title={`${r.severity} change`}
                      className={cn('absolute border-2 rounded-md pointer-events-none', BOX_STYLE[r.severity])}
                      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                    />
                  ))}
                </div>
                <figcaption className="text-[11px] text-muted-foreground">At return{result?.regions.length ? ' — flagged areas outlined' : ''}</figcaption>
              </figure>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Automatic comparison is a screening aid: dirt, reflections and shadows can be flagged, and very small marks can be missed. Always confirm flagged areas in person.
      </p>
    </div>
  );
}
