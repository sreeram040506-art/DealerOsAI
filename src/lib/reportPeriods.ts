/**
 * Reporting periods and date ranges, shared by the P&L, Cash Flow and Lead Source reports.
 * Everything uses the viewer's local calendar, the same as the dates shown elsewhere in the
 * app. Weeks run Monday to Sunday; quarters are calendar quarters (Q1 = Jan-Mar).
 */

export type Granularity = 'week' | 'month' | 'quarter' | 'year';

export interface Period {
  granularity: Granularity;
  /** Sorts chronologically as text: "2026", "2026-Q3", "2026-09", or the Monday's date. */
  key: string;
  label: string;
  start: Date;
  /** Last instant of the period (inclusive). */
  end: Date;
}

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Yearly',
};

const pad = (n: number) => String(n).padStart(2, '0');
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const shortDate = (d: Date, withYear = false) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function monthPeriod(year: number, month: number): Period {
  const start = new Date(year, month, 1);
  return {
    granularity: 'month',
    key: `${year}-${pad(month + 1)}`,
    label: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    start,
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

export function quarterPeriod(year: number, quarter: number): Period {
  return {
    granularity: 'quarter',
    key: `${year}-Q${quarter + 1}`,
    label: `Q${quarter + 1} ${year}`,
    start: new Date(year, quarter * 3, 1),
    end: new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999),
  };
}

export function yearPeriod(year: number): Period {
  return {
    granularity: 'year',
    key: String(year),
    label: String(year),
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

export function weekPeriod(date: Date): Period {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (day.getDay() + 6) % 7; // Sunday -> 6, Monday -> 0
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
  const endDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const sameYear = start.getFullYear() === endDay.getFullYear();
  return {
    granularity: 'week',
    key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    label: `${shortDate(start, !sameYear)} – ${shortDate(endDay, true)}`,
    start,
    end: endOfDay(endDay),
  };
}

/** The period of the given granularity that contains `value`, or null for a bad date. */
export function periodFor(value: Date | string | number | null | undefined, granularity: Granularity): Period | null {
  const d = toDate(value);
  if (!d) return null;
  switch (granularity) {
    case 'year': return yearPeriod(d.getFullYear());
    case 'quarter': return quarterPeriod(d.getFullYear(), Math.floor(d.getMonth() / 3));
    case 'month': return monthPeriod(d.getFullYear(), d.getMonth());
    case 'week': return weekPeriod(d);
  }
}

/** The months inside a year (12) or quarter (3); empty for months and weeks. */
export function childMonths(period: Period): Period[] {
  if (period.granularity === 'year') {
    return Array.from({ length: 12 }, (_, m) => monthPeriod(period.start.getFullYear(), m));
  }
  if (period.granularity === 'quarter') {
    return Array.from({ length: 3 }, (_, i) => monthPeriod(period.start.getFullYear(), period.start.getMonth() + i));
  }
  return [];
}

// ── Date range ───────────────────────────────────────────────────────────────────────────

export type RangeChoice =
  | { kind: 'all' }
  | { kind: 'year'; year: number }
  | { kind: 'custom'; from: string; to: string };

export interface ResolvedRange {
  from: Date | null;
  to: Date | null;
}

/** Turns the picker's choice into concrete bounds. Custom dates are inclusive; either may be empty. */
export function resolveRange(choice: RangeChoice): ResolvedRange {
  if (choice.kind === 'all') return { from: null, to: null };
  if (choice.kind === 'year') return { from: new Date(choice.year, 0, 1), to: new Date(choice.year, 11, 31, 23, 59, 59, 999) };
  return {
    from: choice.from ? new Date(`${choice.from}T00:00:00`) : null,
    to: choice.to ? new Date(`${choice.to}T23:59:59.999`) : null,
  };
}

export function inRange(value: Date | string | number | null | undefined, range: ResolvedRange): boolean {
  const d = toDate(value);
  if (!d) return false;
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

/** Human description of a range, e.g. "2026", "All time", "Mar 1, 2026 – Jun 30, 2026". */
export function describeRange(choice: RangeChoice): string {
  if (choice.kind === 'all') return 'All time';
  if (choice.kind === 'year') return String(choice.year);
  const fmt = (iso: string) => shortDate(new Date(`${iso}T00:00:00`), true);
  if (choice.from && choice.to) return `${fmt(choice.from)} – ${fmt(choice.to)}`;
  if (choice.from) return `From ${fmt(choice.from)}`;
  if (choice.to) return `Until ${fmt(choice.to)}`;
  return 'All time';
}

/** Distinct calendar years found in the dates, newest first, always including the current year. */
export function yearsPresent(dates: (Date | string | null | undefined)[], now: Date = new Date()): number[] {
  const years = new Set<number>([now.getFullYear()]);
  for (const value of dates) {
    const d = toDate(value);
    if (d) years.add(d.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export function sortKeys<T extends { period: Period }>(rows: T[], order: 'newest' | 'oldest'): T[] {
  const sorted = [...rows].sort((a, b) => a.period.key.localeCompare(b.period.key));
  return order === 'newest' ? sorted.reverse() : sorted;
}
