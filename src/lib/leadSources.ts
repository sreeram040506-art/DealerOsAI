import { inRange, type ResolvedRange } from './reportPeriods';

/** Sources offered in the customer form. "Other" lets staff type one that isn't listed. */
export const LEAD_SOURCE_OPTIONS = [
  'CarGurus',
  'Google',
  'Facebook',
  'Instagram',
  'Craigslist',
  'Autotrader',
  'Cars.com',
  'Website',
  'Referral',
  'Repeat customer',
  'Walk-in',
] as const;

export const OTHER_SOURCE = 'Other';
export const NOT_RECORDED = 'Not recorded';

export interface LeadSourceRow {
  source: string;
  count: number;
  /** Share of all customers in the range, 0-100. */
  share: number;
}

const normalise = (value: string | null | undefined) => (value ?? '').trim().replace(/\s+/g, ' ');

/**
 * Customers per lead source within the range (by the date the customer was added). Sources that
 * differ only by case or spacing count as one ("cargurus" and "CarGurus"). Customers with no
 * source are grouped as "Not recorded" and listed last.
 */
export function buildLeadSources(
  customers: { leadSource?: string | null; createdAt: string }[],
  range: ResolvedRange,
): { rows: LeadSourceRow[]; total: number } {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const customer of customers) {
    if (!inRange(customer.createdAt, range)) continue;
    total += 1;
    const label = normalise(customer.leadSource) || NOT_RECORDED;
    const key = label.toLowerCase();
    const entry = counts.get(key) ?? { label, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const rows = [...counts.values()]
    .map(({ label, count }) => ({ source: label, count, share: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => {
      if (a.source === NOT_RECORDED) return 1;
      if (b.source === NOT_RECORDED) return -1;
      return b.count - a.count || a.source.localeCompare(b.source);
    });
  return { rows, total };
}
