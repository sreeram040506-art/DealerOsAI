import type { AdvertisingExpense, BusinessExpense, Sale, Vehicle } from '@/types/inventory';
import { inRange, periodFor, sortKeys, type Granularity, type Period, type ResolvedRange } from './reportPeriods';

export interface FinanceInputs {
  sales: Sale[];
  vehicles: Vehicle[];
  ads: AdvertisingExpense[];
  expenses: BusinessExpense[];
}

// ── Vehicle cost ─────────────────────────────────────────────────────────────────────────

/** Purchase price plus buyer fee, transport, inspection and registration. */
export const purchaseCost = (v: Vehicle) => Number(v.totalPurchaseCost || v.purchase?.totalPurchaseCost || 0);

/** Parts and labour across the vehicle's repairs. */
export const repairsCost = (v: Vehicle) =>
  Number(v.repairCost || v.repairs?.reduce((s, r) => s + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0);

export type CostFlag = 'unread' | 'missing' | 'placeholder';

export const COST_FLAG_TEXT: Record<CostFlag, string> = {
  unread: "The scan couldn't read the price",
  missing: 'No purchase price recorded',
  placeholder: 'Exactly $10,000, which older scans used as a placeholder',
};

/**
 * Whether a vehicle's purchase price should be confirmed. Scans that can't read a price used
 * to save an invented $10,000, which every report counted as real money. New scans now save 0
 * and flag it; this also catches 0 and the old $10,000 placeholder on earlier vehicles.
 */
export function costFlag(v: Vehicle): CostFlag | null {
  if (v.purchase?.priceEstimated) return 'unread';
  const price = Number(v.purchase?.purchasePrice ?? v.purchasePrice ?? 0);
  if (price <= 0) return 'missing';
  if (price === 10000 && v.purchase?.priceEstimated == null) return 'placeholder';
  return null;
}

export interface FlaggedVehicle {
  vehicle: Vehicle;
  flag: CostFlag;
}

export const flaggedVehicles = (vehicles: Vehicle[]): FlaggedVehicle[] =>
  vehicles.flatMap((vehicle) => {
    const flag = costFlag(vehicle);
    return flag ? [{ vehicle, flag }] : [];
  });

// ── Profit & loss ────────────────────────────────────────────────────────────────────────

export interface SoldItem {
  sale: Sale;
  vehicle: Vehicle | null;
  price: number;
  cost: number;
  repairs: number;
  /** price - purchase cost - repairs, the same arithmetic as the P&L rows. */
  gross: number;
  flag: CostFlag | null;
}

export interface PnLRow {
  period: Period;
  units: number;
  revenue: number;
  cogs: number;
  repairCost: number;
  grossProfit: number;
  adSpend: number;
  opExpenses: number;
  totalExpenses: number;
  netProfit: number;
  sold: SoldItem[];
  /** Sold vehicles in this row whose purchase price needs confirming. */
  unverified: number;
}

export interface Totals {
  units: number;
  revenue: number;
  cogs: number;
  repairCost: number;
  grossProfit: number;
  adSpend: number;
  opExpenses: number;
  totalExpenses: number;
  netProfit: number;
  unverified: number;
}

const emptyRow = (period: Period): PnLRow => ({
  period, units: 0, revenue: 0, cogs: 0, repairCost: 0, grossProfit: 0,
  adSpend: 0, opExpenses: 0, totalExpenses: 0, netProfit: 0, sold: [], unverified: 0,
});

export function soldItemsOf(sales: Sale[], vehicles: Vehicle[]): SoldItem[] {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  return sales.map((sale) => {
    const vehicle = byId.get(sale.vehicleId) ?? null;
    const price = Number(sale.salePrice) || 0;
    const cost = vehicle ? purchaseCost(vehicle) : 0;
    const repairs = vehicle ? repairsCost(vehicle) : 0;
    return { sale, vehicle, price, cost, repairs, gross: price - cost - repairs, flag: vehicle ? costFlag(vehicle) : null };
  });
}

/**
 * Profit and loss by period. Sales (and the cost of the vehicles sold) fall in the period of
 * the sale date; advertising by campaign start date; operating expenses by expense date.
 * Only dates inside `range` are counted.
 */
export function buildPnL(
  { sales, vehicles, ads, expenses }: FinanceInputs,
  granularity: Granularity,
  range: ResolvedRange,
  order: 'newest' | 'oldest' = 'newest',
): PnLRow[] {
  const rows = new Map<string, PnLRow>();
  const rowFor = (date: string) => {
    const period = periodFor(date, granularity);
    if (!period) return null;
    if (!rows.has(period.key)) rows.set(period.key, emptyRow(period));
    return rows.get(period.key)!;
  };

  const salesInRange = sales.filter((s) => inRange(s.saleDate, range));
  for (const item of soldItemsOf(salesInRange, vehicles)) {
    const row = rowFor(item.sale.saleDate);
    if (!row) continue;
    row.units += 1;
    row.revenue += item.price;
    row.cogs += item.cost;
    row.repairCost += item.repairs;
    row.sold.push(item);
    if (item.flag) row.unverified += 1;
  }
  for (const ad of ads) {
    if (!inRange(ad.startDate, range)) continue;
    const row = rowFor(ad.startDate);
    if (row) row.adSpend += Number(ad.amountSpent) || 0;
  }
  for (const expense of expenses) {
    if (!inRange(expense.date, range)) continue;
    const row = rowFor(expense.date);
    if (row) row.opExpenses += Number(expense.amount) || 0;
  }

  for (const row of rows.values()) {
    row.grossProfit = row.revenue - row.cogs - row.repairCost;
    row.totalExpenses = row.adSpend + row.opExpenses;
    row.netProfit = row.grossProfit - row.totalExpenses;
    row.sold.sort((a, b) => new Date(b.sale.saleDate).getTime() - new Date(a.sale.saleDate).getTime());
  }
  return sortKeys([...rows.values()], order);
}

export function sumPnL(rows: PnLRow[]): Totals {
  const t: Totals = { units: 0, revenue: 0, cogs: 0, repairCost: 0, grossProfit: 0, adSpend: 0, opExpenses: 0, totalExpenses: 0, netProfit: 0, unverified: 0 };
  for (const r of rows) {
    t.units += r.units; t.revenue += r.revenue; t.cogs += r.cogs; t.repairCost += r.repairCost;
    t.grossProfit += r.grossProfit; t.adSpend += r.adSpend; t.opExpenses += r.opExpenses;
    t.totalExpenses += r.totalExpenses; t.netProfit += r.netProfit; t.unverified += r.unverified;
  }
  return t;
}

// ── Cash flow ────────────────────────────────────────────────────────────────────────────

export interface CashRow {
  period: Period;
  /** Vehicle sales received. */
  salesIn: number;
  /** Vehicle purchases paid (price, fees, transport, inspection, registration). */
  purchases: number;
  /** Reconditioning and repairs paid. */
  repairs: number;
  advertising: number;
  operating: number;
  cashOut: number;
  net: number;
  /** Running balance across the periods shown, oldest first. */
  cumulative: number;
  /** Purchases in this row on vehicles whose price needs confirming. */
  unverifiedPurchases: number;
  unverifiedCount: number;
}

export interface CashTotals {
  salesIn: number; purchases: number; repairs: number; advertising: number; operating: number;
  cashOut: number; net: number; unverifiedPurchases: number; unverifiedCount: number;
}

const emptyCash = (period: Period): CashRow => ({
  period, salesIn: 0, purchases: 0, repairs: 0, advertising: 0, operating: 0,
  cashOut: 0, net: 0, cumulative: 0, unverifiedPurchases: 0, unverifiedCount: 0,
});

/**
 * Cash in and out by the date each payment happened: sales at the sale date, vehicle purchases
 * at the purchase date, repairs at the repair date, advertising at the campaign start and
 * operating expenses at the expense date. Only dates inside `range` are counted, so one year's
 * report never includes another year's money.
 */
export function buildCashFlow(
  { sales, vehicles, ads, expenses }: FinanceInputs,
  granularity: Granularity,
  range: ResolvedRange,
  order: 'newest' | 'oldest' = 'newest',
): CashRow[] {
  const rows = new Map<string, CashRow>();
  const rowFor = (date: string | undefined) => {
    const period = periodFor(date, granularity);
    if (!period) return null;
    if (!rows.has(period.key)) rows.set(period.key, emptyCash(period));
    return rows.get(period.key)!;
  };

  for (const sale of sales) {
    if (!inRange(sale.saleDate, range)) continue;
    const row = rowFor(sale.saleDate);
    if (row) row.salesIn += Number(sale.salePrice) || 0;
  }

  for (const v of vehicles) {
    const boughtOn = v.purchaseDate || v.purchase?.purchaseDate;
    if (inRange(boughtOn, range)) {
      const row = rowFor(boughtOn);
      if (row) {
        const cost = purchaseCost(v);
        row.purchases += cost;
        if (costFlag(v)) {
          row.unverifiedPurchases += cost;
          row.unverifiedCount += 1;
        }
      }
    }
    if (v.repairs?.length) {
      for (const r of v.repairs) {
        const paidOn = r.repairDate || boughtOn;
        if (!inRange(paidOn, range)) continue;
        const row = rowFor(paidOn);
        if (row) row.repairs += (r.partsCost || 0) + (r.laborCost || 0);
      }
    } else if (repairsCost(v) > 0 && inRange(boughtOn, range)) {
      const row = rowFor(boughtOn);
      if (row) row.repairs += repairsCost(v);
    }
  }

  for (const ad of ads) {
    if (!inRange(ad.startDate, range)) continue;
    const row = rowFor(ad.startDate);
    if (row) row.advertising += Number(ad.amountSpent) || 0;
  }
  for (const expense of expenses) {
    if (!inRange(expense.date, range)) continue;
    const row = rowFor(expense.date);
    if (row) row.operating += Number(expense.amount) || 0;
  }

  const chronological = sortKeys([...rows.values()], 'oldest');
  let running = 0;
  for (const row of chronological) {
    row.cashOut = row.purchases + row.repairs + row.advertising + row.operating;
    row.net = row.salesIn - row.cashOut;
    running += row.net;
    row.cumulative = running;
  }
  return order === 'oldest' ? chronological : [...chronological].reverse();
}

export function sumCash(rows: CashRow[]): CashTotals {
  const t: CashTotals = { salesIn: 0, purchases: 0, repairs: 0, advertising: 0, operating: 0, cashOut: 0, net: 0, unverifiedPurchases: 0, unverifiedCount: 0 };
  for (const r of rows) {
    t.salesIn += r.salesIn; t.purchases += r.purchases; t.repairs += r.repairs; t.advertising += r.advertising;
    t.operating += r.operating; t.cashOut += r.cashOut; t.net += r.net;
    t.unverifiedPurchases += r.unverifiedPurchases; t.unverifiedCount += r.unverifiedCount;
  }
  return t;
}

/** Money currently sitting in vehicles that haven't been sold (purchase cost plus repairs). */
export function inventoryCashTiedUp(vehicles: Vehicle[]) {
  const unsold = vehicles.filter((v) => v.status !== 'Sold' && v.status !== 'Returned');
  return { amount: unsold.reduce((s, v) => s + purchaseCost(v) + repairsCost(v), 0), count: unsold.length };
}
