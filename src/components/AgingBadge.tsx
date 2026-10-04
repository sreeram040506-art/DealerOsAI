import { cn } from '@/lib/utils';
import { AGING_STYLES, agingBand } from '@/lib/vehicleAging';

/** Days on lot with the 30 / 60 / 90+ colour bands. Sold vehicles show plain days. */
export default function AgingBadge({ days, sold = false, className }: { days: number; sold?: boolean; className?: string }) {
  const band = sold ? 'new' : agingBand(days);
  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap', AGING_STYLES[band], className)}
      title={sold ? 'Days on lot before sale' : band === 'new' ? 'Under 30 days on lot' : `${band}+ days on lot`}
    >
      {days} {days === 1 ? 'day' : 'days'}
    </span>
  );
}
