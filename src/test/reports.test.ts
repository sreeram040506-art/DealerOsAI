import { describe, expect, it } from 'vitest';
import type { AdvertisingExpense, BusinessExpense, Sale, Vehicle } from '@/types/inventory';
import {
  childMonths, describeRange, inRange, periodFor, resolveRange, yearsPresent,
} from '@/lib/reportPeriods';
import {
  buildCashFlow, buildPnL, costFlag, flaggedVehicles, inventoryCashTiedUp, sumCash, sumPnL,
} from '@/lib/financeReport';
import { buildLeadSources, NOT_RECORDED } from '@/lib/leadSources';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12).toISOString();
const ALL = resolveRange({ kind: 'all' });
const YEAR_2026 = resolveRange({ kind: 'year', year: 2026 });

const car = (id: string, o: { price: number; total?: number; repair?: number; bought: string; status?: string; estimated?: boolean; repairs?: { partsCost: number; laborCost: number; repairDate: string }[] }) => ({
  id, vin: id, make: 'Honda', model: id, year: 2020, status: o.status ?? 'Sold', purchaseDate: o.bought,
  purchasePrice: o.price, totalPurchaseCost: o.total ?? o.price, repairCost: o.repair ?? 0, repairs: o.repairs,
  purchase: { purchasePrice: o.price, totalPurchaseCost: o.total ?? o.price, priceEstimated: o.estimated ?? null },
}) as unknown as Vehicle;
const sale = (id: string, vehicleId: string, price: number, date: string) => ({ id, vehicleId, salePrice: price, saleDate: date, profit: 0, customerName: 'C' }) as unknown as Sale;
const ad = (amount: number, startDate: string) => ({ id: startDate, campaignName: 'x', amountSpent: amount, startDate }) as unknown as AdvertisingExpense;
const exp = (amount: number, date: string) => ({ id: date, category: 'Rent', amount, date }) as unknown as BusinessExpense;

describe('periods', () => {
  it('names the week, month, quarter and year containing a date', () => {
    const date = new Date(2026, 8, 15, 12); // Tue 15 Sep 2026
    expect(periodFor(date, 'month')).toMatchObject({ key: '2026-09', label: 'Sep 2026' });
    expect(periodFor(date, 'quarter')).toMatchObject({ key: '2026-Q3', label: 'Q3 2026' });
    expect(periodFor(date, 'year')).toMatchObject({ key: '2026', label: '2026' });
    expect(periodFor(date, 'week')).toMatchObject({ key: '2026-09-14', label: 'Sep 14 – Sep 20, 2026' });
  });
  it('weeks run Monday to Sunday and may span months', () => {
    expect(periodFor(new Date(2026, 9, 4, 12), 'week')?.key).toBe('2026-09-28'); // Sunday belongs to the week before
    expect(periodFor(new Date(2026, 9, 5, 12), 'week')?.key).toBe('2026-10-05'); // Monday starts a new one
    expect(periodFor(new Date(2026, 9, 1, 12), 'week')?.label).toBe('Sep 28 – Oct 4, 2026');
  });
  it('rejects bad dates', () => {
    expect(periodFor('not a date', 'month')).toBeNull();
    expect(periodFor(null, 'year')).toBeNull();
  });
  it('splits a year into 12 months and a quarter into 3', () => {
    expect(childMonths(periodFor(new Date(2026, 5, 1), 'year')!).map((p) => p.key)).toHaveLength(12);
    expect(childMonths(periodFor(new Date(2026, 7, 1), 'quarter')!).map((p) => p.label)).toEqual(['Jul 2026', 'Aug 2026', 'Sep 2026']);
    expect(childMonths(periodFor(new Date(2026, 7, 1), 'month')!)).toEqual([]);
  });
  it('treats custom range ends as inclusive whole days', () => {
    const range = resolveRange({ kind: 'custom', from: '2026-03-01', to: '2026-03-31' });
    expect(inRange(new Date(2026, 2, 1, 0, 0, 0), range)).toBe(true);
    expect(inRange(new Date(2026, 2, 31, 23, 59, 0), range)).toBe(true);
    expect(inRange(new Date(2026, 3, 1, 0, 0, 1), range)).toBe(false);
    expect(inRange(new Date(2026, 1, 28, 23, 59, 0), range)).toBe(false);
    expect(resolveRange({ kind: 'custom', from: '2026-03-01', to: '' }).to).toBeNull();
  });
  it('lists years with data, newest first, always including the current year', () => {
    const years = yearsPresent([d(2024, 5, 1), d(2025, 1, 1), null], new Date(2026, 9, 3));
    expect(years).toEqual([2026, 2025, 2024]);
  });
  it('describes ranges', () => {
    expect(describeRange({ kind: 'year', year: 2026 })).toBe('2026');
    expect(describeRange({ kind: 'all' })).toBe('All time');
    expect(describeRange({ kind: 'custom', from: '2026-03-01', to: '2026-06-30' })).toBe('Mar 1, 2026 – Jun 30, 2026');
  });
});

describe('profit and loss', () => {
  const vehicles = [
    car('a', { price: 8000, total: 8500, repair: 500, bought: d(2026, 1, 10) }),
    car('b', { price: 12000, bought: d(2026, 2, 5) }),
    car('old', { price: 5000, bought: d(2025, 6, 1) }),
  ];
  const sales = [
    sale('1', 'a', 11000, d(2026, 3, 15)),  // gross 11000 - 8500 - 500 = 2000
    sale('2', 'b', 15000, d(2026, 5, 2)),   // gross 3000
    sale('3', 'old', 7000, d(2025, 11, 20)), // gross 2000, last year
  ];
  const ads = [ad(300, d(2026, 3, 1)), ad(999, d(2025, 11, 1))];
  const expenses = [exp(1000, d(2026, 3, 31)), exp(400, d(2026, 5, 20)), exp(5000, d(2025, 12, 1))];
  const inputs = { sales, vehicles, ads, expenses };

  it('defaults to one year without leaking other years', () => {
    const rows = buildPnL(inputs, 'year', YEAR_2026);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ units: 2, revenue: 26000, cogs: 20500, repairCost: 500, grossProfit: 5000, adSpend: 300, opExpenses: 1400, totalExpenses: 1700, netProfit: 3300 });
  });
  it('all time includes every year, newest first', () => {
    const rows = buildPnL(inputs, 'year', ALL);
    expect(rows.map((r) => r.period.label)).toEqual(['2026', '2025']);
    expect(rows[1]).toMatchObject({ revenue: 7000, grossProfit: 2000, adSpend: 999, opExpenses: 5000, netProfit: 2000 - 999 - 5000 });
    expect(buildPnL(inputs, 'year', ALL, 'oldest').map((r) => r.period.label)).toEqual(['2025', '2026']);
  });
  it('groups by month, quarter and week', () => {
    expect(buildPnL(inputs, 'month', YEAR_2026).map((r) => [r.period.label, r.units, r.netProfit])).toEqual([
      ['May 2026', 1, 3000 - 400], ['Mar 2026', 1, 2000 - 300 - 1000],
    ]);
    expect(buildPnL(inputs, 'quarter', YEAR_2026).map((r) => [r.period.label, r.units])).toEqual([['Q2 2026', 1], ['Q1 2026', 1]]);
    expect(buildPnL(inputs, 'week', YEAR_2026).every((r) => r.period.granularity === 'week')).toBe(true);
  });
  it('totals match the sum of the rows, and the sold list foots to the row', () => {
    const rows = buildPnL(inputs, 'month', YEAR_2026);
    const totals = sumPnL(rows);
    expect(totals).toMatchObject({ units: 2, revenue: 26000, grossProfit: 5000, netProfit: 3300 });
    const march = rows.find((r) => r.period.key === '2026-03')!;
    expect(march.sold.reduce((s, i) => s + i.gross, 0)).toBe(march.grossProfit);
  });
  it('respects a custom date range', () => {
    const range = resolveRange({ kind: 'custom', from: '2026-03-01', to: '2026-03-31' });
    expect(sumPnL(buildPnL(inputs, 'month', range))).toMatchObject({ units: 1, revenue: 11000, adSpend: 300, opExpenses: 1000, netProfit: 2000 - 1300 });
  });
  it('is empty with no data', () => {
    expect(buildPnL({ sales: [], vehicles: [], ads: [], expenses: [] }, 'month', ALL)).toEqual([]);
  });
});

describe('vehicle cost checks', () => {
  it('flags unread, missing and placeholder prices', () => {
    expect(costFlag(car('x', { price: 0, bought: d(2026, 1, 1), estimated: true }))).toBe('unread');
    expect(costFlag(car('x', { price: 0, bought: d(2026, 1, 1) }))).toBe('missing');
    expect(costFlag(car('x', { price: 10000, bought: d(2026, 1, 1) }))).toBe('placeholder');
    expect(costFlag(car('x', { price: 10000, bought: d(2026, 1, 1), estimated: false }))).toBeNull(); // confirmed by a person
    expect(costFlag(car('x', { price: 9500, bought: d(2026, 1, 1) }))).toBeNull();
    expect(flaggedVehicles([car('a', { price: 10000, bought: d(2026, 1, 1) }), car('b', { price: 7000, bought: d(2026, 1, 1) })])).toHaveLength(1);
  });
  it('counts flagged vehicles in the P&L so the report can warn', () => {
    const vehicles = [car('a', { price: 10000, bought: d(2026, 1, 1) })];
    const rows = buildPnL({ sales: [sale('1', 'a', 12000, d(2026, 2, 1))], vehicles, ads: [], expenses: [] }, 'year', ALL);
    expect(rows[0].unverified).toBe(1);
    expect(rows[0].sold[0].flag).toBe('placeholder');
  });
});

describe('cash flow', () => {
  const vehicles = [
    car('a', { price: 8000, total: 8500, bought: d(2026, 1, 10), repairs: [{ partsCost: 300, laborCost: 200, repairDate: d(2026, 2, 12) }] }),
    car('b', { price: 12000, bought: d(2026, 2, 5), status: 'Available' }),
    car('last', { price: 4000, bought: d(2025, 12, 20) }),
  ];
  const inputs = { sales: [sale('1', 'a', 11000, d(2026, 3, 15)), sale('2', 'last', 6000, d(2026, 1, 5))], vehicles, ads: [ad(200, d(2026, 2, 1))], expenses: [exp(1000, d(2026, 3, 31))] };

  it('puts each payment in the month it happened and keeps a running balance', () => {
    const rows = buildCashFlow(inputs, 'month', YEAR_2026, 'oldest');
    expect(rows.map((r) => r.period.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    // Jan: sale 6000 in, purchase 8500 out        -> -2500
    // Feb: purchase 12000 + repair 500 + ad 200   -> -12700, cumulative -15200
    // Mar: sale 11000 in, expense 1000 out        -> +10000, cumulative -5200
    expect(rows.map((r) => [r.salesIn, r.purchases, r.repairs, r.advertising, r.operating, r.net, r.cumulative])).toEqual([
      [6000, 8500, 0, 0, 0, -2500, -2500],
      [0, 12000, 500, 200, 0, -12700, -15200],
      [11000, 0, 0, 0, 1000, 10000, -5200],
    ]);
    expect(sumCash(rows)).toMatchObject({ salesIn: 17000, cashOut: 22200, net: -5200 });
  });
  it("leaves out other years' money", () => {
    const rows = buildCashFlow(inputs, 'year', YEAR_2026);
    expect(rows).toHaveLength(1);
    expect(rows[0].purchases).toBe(20500); // the Dec 2025 purchase (4000) is not here
    expect(buildCashFlow(inputs, 'year', ALL)).toHaveLength(2);
  });
  it('reports unverified purchase prices separately', () => {
    const flagged = [car('p', { price: 10000, bought: d(2026, 4, 1) }), car('q', { price: 7000, bought: d(2026, 4, 2) })];
    const rows = buildCashFlow({ ...inputs, vehicles: flagged, sales: [], ads: [], expenses: [] }, 'month', ALL);
    expect(rows[0]).toMatchObject({ purchases: 17000, unverifiedPurchases: 10000, unverifiedCount: 1 });
  });
  it('totals the cash tied up in unsold cars', () => {
    expect(inventoryCashTiedUp(vehicles)).toEqual({ amount: 12000, count: 1 });
  });
});

describe('lead sources', () => {
  const customers = [
    { leadSource: 'CarGurus', createdAt: d(2026, 1, 5) },
    { leadSource: ' cargurus ', createdAt: d(2026, 2, 5) },
    { leadSource: 'Google', createdAt: d(2026, 3, 5) },
    { leadSource: '', createdAt: d(2026, 3, 6) },
    { leadSource: null, createdAt: d(2026, 3, 7) },
    { leadSource: 'Referral', createdAt: d(2025, 6, 7) },
  ];
  it('counts customers per source, merging case and spacing, with unrecorded last', () => {
    const { rows, total } = buildLeadSources(customers, ALL);
    expect(total).toBe(6);
    expect(rows.map((r) => [r.source, r.count])).toEqual([['CarGurus', 2], ['Google', 1], ['Referral', 1], [NOT_RECORDED, 2]]);
    expect(rows[0].share).toBeCloseTo(33.33, 1);
  });
  it('limits to a date range', () => {
    const { rows, total } = buildLeadSources(customers, YEAR_2026);
    expect(total).toBe(5);
    expect(rows.some((r) => r.source === 'Referral')).toBe(false);
  });
});
