import type { Customer } from '@/hooks/useCustomers';

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole calendar days from `iso` to today (0 = today). Null for a missing or invalid date. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS));
}

export function describeDaysAgo(days: number | null): string {
  if (days === null) return 'No visit recorded';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export const VISIT_SOURCE_TEXT: Record<string, string> = {
  visit: 'Visit recorded',
  purchase: 'Bought a car',
  viewing: 'Looked at a car',
};

/** Two or more cars bought makes a repeat buyer. */
export const isRepeatBuyer = (customer: Pick<Customer, 'carsBought'>) => (customer.carsBought ?? 0) >= 2;

/** Customers not seen for this many days are shown as going cold. */
export const COLD_AFTER_DAYS = 180;

export const CUSTOMER_SORT_LABELS = {
  newest: 'Newest added',
  oldest: 'Oldest added',
  nameAsc: 'Name (A–Z)',
  nameDesc: 'Name (Z–A)',
  carsDesc: 'Most cars bought',
  carsAsc: 'Fewest cars bought',
  visitRecent: 'Last visit (most recent)',
  visitOldest: 'Last visit (longest ago)',
  sourceAsc: 'Lead source (A–Z)',
  vehicleAsc: 'Vehicle (A–Z)',
} as const;
export type CustomerSortKey = keyof typeof CUSTOMER_SORT_LABELS;

export interface SortableCustomer {
  customer: Customer;
  meta: { vehicleLabel?: string };
}

const fullName = (c: Customer) => `${c.firstName} ${c.lastName || ''}`.trim();
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Text compare that always puts empty values last, whichever direction is asked for. */
const emptyLast = (a: string, b: string, direction: 1 | -1) => {
  if (!a !== !b) return a ? -1 : 1;
  return direction * text(a, b);
};

/**
 * Sorts customers for the list. Customers with nothing to sort on (no visit, no source, no
 * vehicle) go to the bottom in either direction. Ties fall back to name A-Z.
 */
export function sortCustomers<T extends SortableCustomer>(items: T[], key: CustomerSortKey): T[] {
  const compare = (a: T, b: T): number => {
    const ca = a.customer;
    const cb = b.customer;
    switch (key) {
      case 'newest': return time(cb.createdAt) - time(ca.createdAt);
      case 'oldest': return time(ca.createdAt) - time(cb.createdAt);
      case 'nameAsc': return text(fullName(ca), fullName(cb));
      case 'nameDesc': return text(fullName(cb), fullName(ca));
      case 'carsDesc': return (cb.carsBought ?? 0) - (ca.carsBought ?? 0);
      case 'carsAsc': return (ca.carsBought ?? 0) - (cb.carsBought ?? 0);
      case 'visitRecent':
      case 'visitOldest': {
        const ta = time(ca.lastVisitDate);
        const tb = time(cb.lastVisitDate);
        if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
        if (Number.isNaN(ta)) return 0;
        return key === 'visitRecent' ? tb - ta : ta - tb;
      }
      case 'sourceAsc': return emptyLast((ca.leadSource ?? '').trim(), (cb.leadSource ?? '').trim(), 1);
      case 'vehicleAsc': return emptyLast(a.meta.vehicleLabel ?? '', b.meta.vehicleLabel ?? '', 1);
    }
  };
  return [...items].sort((a, b) => compare(a, b) || text(fullName(a.customer), fullName(b.customer)));
}
