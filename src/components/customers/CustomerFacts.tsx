import { Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSafeDate } from '@/lib/dateUtils';
import type { Customer } from '@/hooks/useCustomers';
import { COLD_AFTER_DAYS, VISIT_SOURCE_TEXT, daysSince, describeDaysAgo, isRepeatBuyer } from '@/lib/customerInsights';

/** Cars this customer has bought, with a "Repeat buyer" tag from the second car on. */
export function CarsBought({ customer }: { customer: Customer }) {
  const count = customer.carsBought ?? 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('font-bold tabular-nums', count === 0 ? 'text-muted-foreground' : 'text-foreground')}>{count}</span>
      {isRepeatBuyer(customer) && (
        <span className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-green-700 dark:text-green-400">
          <Repeat className="h-3 w-3" aria-hidden="true" /> Repeat buyer
        </span>
      )}
    </span>
  );
}

/** Days since the customer's last visit, with what that visit was in the tooltip. */
export function LastVisit({ customer, className }: { customer: Customer; className?: string }) {
  const days = daysSince(customer.lastVisitDate);
  if (days === null) return <span className={cn('text-muted-foreground', className)}>No visit recorded</span>;
  const what = customer.lastVisitSource ? VISIT_SOURCE_TEXT[customer.lastVisitSource] : 'Last visit';
  const cold = days >= COLD_AFTER_DAYS;
  return (
    <span
      className={cn('whitespace-nowrap', cold ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-foreground', className)}
      title={`${what} on ${formatSafeDate(customer.lastVisitDate)}${cold ? ' — not seen in over 6 months' : ''}`}
    >
      {describeDaysAgo(days)}
    </span>
  );
}
