import { describe, expect, it } from 'vitest';
import type { Customer } from '@/hooks/useCustomers';
import { describeDaysAgo, daysSince, isRepeatBuyer, sortCustomers, type CustomerSortKey } from '@/lib/customerInsights';

const NOW = new Date(2026, 9, 4, 15, 30); // Sun 4 Oct 2026, mid-afternoon

describe('days since last visit', () => {
  it('counts whole calendar days, ignoring the time of day', () => {
    expect(daysSince(new Date(2026, 9, 4, 8).toISOString(), NOW)).toBe(0);
    expect(daysSince(new Date(2026, 9, 3, 23, 59).toISOString(), NOW)).toBe(1);   // late yesterday is 1 day, not 0
    expect(daysSince(new Date(2026, 8, 4, 12).toISOString(), NOW)).toBe(30);
    expect(daysSince(new Date(2025, 9, 4, 12).toISOString(), NOW)).toBe(365);
  });
  it('is null for a missing or invalid date, and never negative', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('', NOW)).toBeNull();
    expect(daysSince('not a date', NOW)).toBeNull();
    expect(daysSince(new Date(2026, 9, 6).toISOString(), NOW)).toBe(0);
  });
  it('words the age', () => {
    expect([0, 1, 2, 45, 59, 60, 400, 800].map(describeDaysAgo)).toEqual(
      ['Today', 'Yesterday', '2 days ago', '45 days ago', '59 days ago', '2 months ago', '13 months ago', '2 years ago']);
    expect(describeDaysAgo(null)).toBe('No visit recorded');
  });
  it('treats 2+ cars as a repeat buyer', () => {
    expect([undefined, 0, 1, 2, 5].map((n) => isRepeatBuyer({ carsBought: n }))).toEqual([false, false, false, true, true]);
  });
});

describe('customer sorting', () => {
  const c = (id: string, first: string, o: Partial<Customer> & { vehicle?: string } = {}) => ({
    customer: { id, firstName: first, lastName: null, createdAt: o.createdAt ?? '2026-01-01T00:00:00Z', ...o } as Customer,
    meta: { vehicleLabel: o.vehicle },
  });
  //          added   cars  last visit    source      vehicle
  // a Ann    Mar      1    Sep 1         Google      2020 Honda Civic
  // b bob    Jan      3    Jun 1         CarGurus    2018 Audi S7
  // c Cara   May      0    (none)        (none)      (none)
  // d Dan    Feb      2    Sep 20        Referral    2022 Ford F-150
  const items = [
    c('a', 'Ann',  { createdAt: '2026-03-01T00:00:00Z', carsBought: 1, lastVisitDate: '2026-09-01T12:00:00Z', leadSource: 'Google',   vehicle: '2020 Honda Civic' }),
    c('b', 'bob',  { createdAt: '2026-01-01T00:00:00Z', carsBought: 3, lastVisitDate: '2026-06-01T12:00:00Z', leadSource: 'CarGurus', vehicle: '2018 Audi S7' }),
    c('c', 'Cara', { createdAt: '2026-05-01T00:00:00Z', carsBought: 0, lastVisitDate: null,                   leadSource: null }),
    c('d', 'Dan',  { createdAt: '2026-02-01T00:00:00Z', carsBought: 2, lastVisitDate: '2026-09-20T12:00:00Z', leadSource: 'Referral', vehicle: '2022 Ford F-150' }),
  ];
  const order = (key: CustomerSortKey) => sortCustomers(items, key).map((i) => i.customer.id).join('');

  it('by date added', () => {
    expect(order('newest')).toBe('cadb'); // May, Mar, Feb, Jan
    expect(order('oldest')).toBe('bdac'); // Jan, Feb, Mar, May
  });
  it('by name, ignoring case', () => {
    expect(order('nameAsc')).toBe('abcd');
    expect(order('nameDesc')).toBe('dcba');
  });
  it('by cars bought, repeat buyers first or last', () => {
    expect(order('carsDesc')).toBe('bdac'); // 3, 2, 1, 0
    expect(order('carsAsc')).toBe('cadb');  // 0, 1, 2, 3
  });
  it('by last visit, with customers who have none always last', () => {
    expect(order('visitRecent')).toBe('dabc'); // Sep 20, Sep 1, Jun 1, none
    expect(order('visitOldest')).toBe('badc'); // Jun 1, Sep 1, Sep 20, none
  });
  it('by lead source A-Z, with no source last', () => {
    expect(order('sourceAsc')).toBe('badc'); // CarGurus, Google, Referral, none
  });
  it('by vehicle A-Z, with no vehicle last', () => {
    expect(order('vehicleAsc')).toBe('badc'); // 2018 Audi, 2020 Honda, 2022 Ford, none
  });
  it('breaks ties by name', () => {
    const tied = [c('z', 'Zed', { carsBought: 1 }), c('m', 'Mia', { carsBought: 1 })];
    expect(sortCustomers(tied, 'carsDesc').map((i) => i.customer.id).join('')).toBe('mz');
  });
  it('does not change the original list', () => {
    const before = items.map((i) => i.customer.id).join('');
    sortCustomers(items, 'nameDesc');
    expect(items.map((i) => i.customer.id).join('')).toBe(before);
  });
});
