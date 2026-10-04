import prisma from '../db/prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days a vehicle has been (or was) on the lot: from its purchase date to its sale date, or to
 * today if unsold. The stored Vehicle.daysInInventory field was never updated after creation,
 * so it read 0 (or a stale import value) and aging never reached 60+ days.
 */
export function daysInStock(vehicle, now = new Date()) {
  const start = new Date(vehicle?.purchaseDate || vehicle?.purchase?.purchaseDate || vehicle?.createdAt || now);
  const saleDate = vehicle?.sale?.saleDate ? new Date(vehicle.sale.saleDate) : null;
  const end = saleDate && !Number.isNaN(saleDate.getTime()) ? saleDate : now;
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

/** "YYMM" for a date, e.g. September 2026 -> "2609". */
function periodOf(date) {
  const d = new Date(date);
  const valid = !Number.isNaN(d.getTime()) ? d : new Date();
  return `${String(valid.getUTCFullYear()).slice(-2)}${String(valid.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function nextSequence(dealershipId, period) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const counter = await prisma.stockCounter.upsert({
        where: { dealershipId_period: { dealershipId, period } },
        create: { dealershipId, period, seq: 1 },
        update: { seq: { increment: 1 } },
      });
      return counter.seq;
    } catch (err) {
      // Two first-of-the-month inserts can race on the unique index; the retry increments.
      if (err?.code !== 'P2002' || attempt === 2) throw err;
    }
  }
  return null;
}

/**
 * Stock number for lot tracking and key tags: two-digit year, two-digit month of purchase,
 * then a 5-digit sequence that restarts each month (first car bought Sept 2026 = 260900001).
 */
export async function generateStockNumber(dealershipId, purchaseDate) {
  const period = periodOf(purchaseDate);
  const seq = await nextSequence(dealershipId, period);
  return `${period}${String(seq).padStart(5, '0')}`;
}

/**
 * Gives every vehicle of a dealership that lacks a stock number one, oldest purchase first.
 * Vehicles are created from several places (manual entry, document scans, imports), so this
 * runs when inventory is read instead of relying on each path. Returns how many were assigned.
 */
export async function ensureStockNumbers(dealershipId) {
  const missing = await prisma.vehicle.findMany({
    where: { dealershipId, OR: [{ stockNumber: null }, { stockNumber: { isSet: false } }] },
    select: { id: true, purchaseDate: true, createdAt: true },
    orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }],
  });
  let assigned = 0;
  for (const vehicle of missing) {
    const stockNumber = await generateStockNumber(dealershipId, vehicle.purchaseDate || vehicle.createdAt);
    // Conditional so a concurrent request can't overwrite a number already given.
    const { count } = await prisma.vehicle.updateMany({
      where: { id: vehicle.id, OR: [{ stockNumber: null }, { stockNumber: { isSet: false } }] },
      data: { stockNumber },
    });
    assigned += count;
  }
  return assigned;
}
