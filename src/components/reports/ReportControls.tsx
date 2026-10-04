import { ArrowDownUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { GRANULARITY_LABELS, type Granularity, type RangeChoice } from '@/lib/reportPeriods';
import type { ReportFilters } from '@/lib/reportFilters';

const GRANULARITIES = Object.keys(GRANULARITY_LABELS) as Granularity[];

const toValue = (range: RangeChoice) => (range.kind === 'year' ? `year:${range.year}` : range.kind);

/** Period view, date range and order for a report. Pass `showGranularity={false}` for reports with no periods. */
export default function ReportControls({
  filters,
  onChange,
  years,
  showGranularity = true,
  showOrder = true,
}: {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  years: number[];
  showGranularity?: boolean;
  showOrder?: boolean;
}) {
  const custom = filters.range.kind === 'custom' ? filters.range : null;

  const setRange = (value: string) => {
    if (value === 'all') onChange({ ...filters, range: { kind: 'all' } });
    else if (value === 'custom') onChange({ ...filters, range: { kind: 'custom', from: custom?.from ?? '', to: custom?.to ?? '' } });
    else onChange({ ...filters, range: { kind: 'year', year: Number(value.slice(5)) } });
  };

  return (
    <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Report filters">
      {showGranularity && (
        <div className="flex rounded-xl border border-border/60 bg-muted p-1" role="tablist" aria-label="Period view">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={filters.granularity === g}
              onClick={() => onChange({ ...filters, granularity: g })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                filters.granularity === g ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>
      )}

      <select
        value={toValue(filters.range)}
        onChange={(e) => setRange(e.target.value)}
        aria-label="Date range"
        className="h-9 rounded-xl border border-border bg-card px-3 text-sm font-medium shadow-sm"
      >
        {years.map((y) => (
          <option key={y} value={`year:${y}`}>{y === new Date().getFullYear() ? `This year (${y})` : String(y)}</option>
        ))}
        <option value="all">All time</option>
        <option value="custom">Custom dates…</option>
      </select>

      {custom && (
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" aria-label="From date" value={custom.from} max={custom.to || undefined}
            onChange={(e) => onChange({ ...filters, range: { ...custom, from: e.target.value } })} className="h-9 w-[150px]" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" value={custom.to} min={custom.from || undefined}
            onChange={(e) => onChange({ ...filters, range: { ...custom, to: e.target.value } })} className="h-9 w-[150px]" />
        </div>
      )}

      {showOrder && (
        <button
          type="button"
          onClick={() => onChange({ ...filters, order: filters.order === 'newest' ? 'oldest' : 'newest' })}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium shadow-sm hover:bg-muted/50"
          title="Reverse the order of the periods"
        >
          <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {filters.order === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>
      )}
    </div>
  );
}
