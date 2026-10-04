import { useMemo, useState } from 'react';
import { describeRange, resolveRange, type Granularity, type RangeChoice, type ResolvedRange } from './reportPeriods';

export interface ReportFilters {
  granularity: Granularity;
  range: RangeChoice;
  order: 'newest' | 'oldest';
}

/**
 * Filter state for a report. Financial reports open on the current calendar year, so all-time
 * totals only appear when someone asks for them.
 */
export function useReportFilters(defaults: { granularity?: Granularity; range?: RangeChoice } = {}) {
  const [filters, setFilters] = useState<ReportFilters>({
    granularity: defaults.granularity ?? 'month',
    range: defaults.range ?? { kind: 'year', year: new Date().getFullYear() },
    order: 'newest',
  });
  const resolved: ResolvedRange = useMemo(() => resolveRange(filters.range), [filters.range]);
  const rangeLabel = useMemo(() => describeRange(filters.range), [filters.range]);
  return { filters, setFilters, resolved, rangeLabel };
}
