import prisma from '../db/prisma.js';
import { daysInStock } from '../utils/vehicleStock.js';
import { getDealershipSettings, resolveOpenAiKey } from './dealershipSettings.js';
import { dispatchNotification } from './notificationDispatcher.js';

// Daily market check for vehicles that have not sold. It searches the web for similar vehicles
// that are for sale, works out the market price itself from what it found, and saves a
// suggestion for an owner or manager to apply or dismiss. A price is never changed here.

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_DEALERSHIP_PER_RUN = 10;
const MIN_COMPARABLES = 3;
const CHANGE_THRESHOLD = 0.03; // within 3% of the market price counts as in line
const MODEL = process.env.OPENAI_PRICING_MODEL || 'gpt-4.1-mini';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const roundTo = (value, step) => Math.round(value / step) * step;
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

const urlKey = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}` : null;
  } catch {
    return null;
  }
};

/** Pulls the text and the pages the search actually visited out of a Responses API result. */
function readResponse(payload) {
  let text = '';
  const cited = new Map();
  for (const item of payload?.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type !== 'output_text') continue;
      text += part.text || '';
      for (const a of part.annotations || []) if (a.type === 'url_citation' && a.url) {
        const key = urlKey(a.url);
        if (key) cited.set(key, a.url);
      }
    }
  }
  return { text, cited };
}

/**
 * Keeps only listings that are plausible and that point at a page the search really found:
 * the model cannot invent a link or a price and have it counted.
 */
export function cleanComparables(raw, cited) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const price = Number(c?.price);
    const key = urlKey(String(c?.url || ''));
    if (!Number.isFinite(price) || price < 1000 || price > 500000) continue;
    if (!key || !cited.has(key) || seen.has(key)) continue;
    seen.add(key);
    const mileage = Number(c?.mileage);
    out.push({
      title: String(c?.title || '').slice(0, 160),
      price: Math.round(price),
      mileage: Number.isFinite(mileage) && mileage >= 0 && mileage < 1e6 ? Math.round(mileage) : null,
      url: cited.get(key),
      source: String(c?.source || new URL(cited.get(key)).hostname.replace(/^www\./, '')).slice(0, 80),
    });
  }
  return out.slice(0, 10);
}

/** Market numbers from the comparables. Far-out prices (half or double the middle) are ignored. */
export function marketFrom(comparables) {
  if (comparables.length < MIN_COMPARABLES) return null;
  const mid = median(comparables.map((c) => c.price));
  const kept = comparables.filter((c) => c.price >= mid * 0.5 && c.price <= mid * 2);
  if (kept.length < MIN_COMPARABLES) return null;
  const prices = kept.map((c) => c.price);
  return { low: Math.min(...prices), high: Math.max(...prices), median: median(prices), used: kept };
}

/** "Boston, MA" out of "1 Main St, Boston, MA 02110", so the search can look nearby first. */
function areaOf(address) {
  const m = String(address || '').match(/,\s*([^,]+),\s*([A-Z]{2})\b/);
  return m ? `${m[1].trim()}, ${m[2]}` : '';
}

const PASSES = [
  {
    label: null,
    ask: (v, area) => `Go to the websites of used-car dealerships${area ? ` in and around ${area} (within about 100 miles)` : ''}, franchise and independent, and look through their used inventory pages for vehicles comparable to this one: ${v.year} ${v.make} ${v.model}, about ${Number(v.mileage).toLocaleString('en-US')} miles. Open the dealerships' own sites (for example their "used inventory" or "pre-owned" pages), not only aggregator sites. Same make and model, model year ${v.year - 1} to ${v.year + 1}, mileage within about 40% of this vehicle.`,
  },
  {
    label: 'search widened',
    ask: (v) => `Search the websites of used-car dealerships anywhere in the US, and large listing sites such as Cars.com, CarGurus, Autotrader and CarMax, for this vehicle or close to it: ${v.make} ${v.model}, model year ${v.year - 2} to ${v.year + 2}, about ${Number(v.mileage).toLocaleString('en-US')} miles (anywhere from 60% to 140% of that is fine).`,
  },
];

async function searchOnce(prompt, apiKey) {
  const response = await fetch(`${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, tools: [{ type: 'web_search', search_context_size: 'high', user_location: { type: 'approximate', country: 'US' } }], tool_choice: 'required', input: prompt }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Market search failed (${response.status}) ${detail.slice(0, 200)}`);
  }
  const { text, cited } = readResponse(await response.json());
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  let parsed;
  try { parsed = JSON.parse(json); } catch { return []; }
  return cleanComparables(parsed.comparables, cited);
}

/**
 * Looks at nearby dealership websites first. Only if that finds fewer than 3 usable listings is
 * the search widened (more years, any region, big listing sites). Returns what it found and
 * whether it had to widen.
 */
async function searchComparables(vehicle, dealership, apiKey) {
  const area = areaOf(dealership?.address);
  const rules = `
Rules: only real vehicles currently for sale that you actually saw on a page. No auctions, no salvage or rebuilt titles, no listings without a shown price, and not this dealership's own listings. Give up to 8 listings.
Reply with JSON only, no other text: {"comparables":[{"title":"2014 Honda Accord EX","price":12345,"mileage":67890,"url":"https://...","source":"dealership or site name"}]}
"price" is the asking price in US dollars as a plain number, and "url" is the page for that vehicle.`;
  const found = new Map();
  let widened = false;
  for (const pass of PASSES) {
    const comps = await searchOnce(pass.ask(vehicle, area) + rules, apiKey);
    for (const c of comps) if (!found.has(c.url)) found.set(c.url, c);
    if (pass.label && comps.length) widened = true;
    if (found.size >= MIN_COMPARABLES) break;
  }
  return { comparables: [...found.values()].slice(0, 10), widened };
}

const vehicleInclude = { purchase: true, sale: { select: { saleDate: true } }, repairs: { select: { partsCost: true, laborCost: true } } };

const totalCost = (v) => (v.purchase?.totalPurchaseCost || 0) + (v.repairs || []).reduce((s, r) => s + (r.partsCost || 0) + (r.laborCost || 0), 0);

/**
 * Checks one vehicle against the market and records the outcome. Returns the saved record, or
 * { error } if the search itself failed (nothing is saved, so it is tried again next time).
 */
export async function checkVehicle(vehicleId, dealershipId, { now = new Date() } = {}) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, dealershipId }, include: vehicleInclude });
  if (!vehicle) return { error: 'Vehicle not found.' };
  if (vehicle.status === 'Sold' || vehicle.sale) return { error: 'This vehicle is already sold.' };
  const apiKey = await resolveOpenAiKey(dealershipId);
  if (!apiKey) return { error: 'No OpenAI key is available for this dealership, or AI features are turned off in Settings.' };

  const dealership = await prisma.dealership.findUnique({ where: { id: dealershipId }, select: { address: true } });
  let comparables;
  let widened = false;
  try {
    ({ comparables, widened } = await searchComparables(vehicle, dealership, apiKey));
  } catch (err) {
    console.error('[Pricing]', err.message);
    return { error: 'The market search failed. Please try again later.' };
  }

  const base = { vehicleId, dealershipId, daysOnLot: daysInStock(vehicle, now), currentPrice: vehicle.askingPrice ?? null };
  const market = marketFrom(comparables);
  if (!market) {
    const record = await prisma.priceSuggestion.create({ data: { ...base, status: 'NO_DATA', reason: `Only ${comparables.length} comparable listing${comparables.length === 1 ? ' was' : 's were'} found on dealership websites and listing sites; at least ${MIN_COMPARABLES} are needed to suggest a price.`, comparables } });
    return { record };
  }

  const suggested = roundTo(market.median, 50);
  const data = {
    ...base,
    suggestedPrice: suggested,
    marketLow: Math.round(market.low), marketMedian: Math.round(market.median), marketHigh: Math.round(market.high),
    belowCost: suggested < totalCost(vehicle) && totalCost(vehicle) > 0,
    comparables: market.used,
  };
  const current = vehicle.askingPrice;
  if (current && Math.abs(current - suggested) / suggested < CHANGE_THRESHOLD) {
    return { record: await prisma.priceSuggestion.create({ data: { ...data, status: 'IN_LINE', reason: `Your price of ${money(current)} is in line with the market (${money(market.median)} from ${market.used.length} listings${widened ? ', search widened to more years and areas' : ''}).` } }) };
  }
  const reason = current
    ? `Your price of ${money(current)} is ${Math.round((Math.abs(current - suggested) / suggested) * 100)}% ${current > suggested ? 'above' : 'below'} the market median of ${money(market.median)} (range ${money(market.low)}–${money(market.high)}, ${market.used.length} similar listings${widened ? '; search widened to more years and areas' : ''}).`
    : `No asking price is set. Similar vehicles list around ${money(market.median)} (range ${money(market.low)}–${money(market.high)}, ${market.used.length} listings).`;
  return { record: await prisma.priceSuggestion.create({ data: { ...data, status: 'PENDING', reason } }) };
}

/** Vehicles on the lot at least `staleDays`, not checked in the last week, longest on the lot first. */
export async function findStaleVehicles(dealershipId, staleDays, now = new Date()) {
  const vehicles = await prisma.vehicle.findMany({
    where: { dealershipId, status: 'Available', sale: { is: null } },
    include: { purchase: { select: { purchaseDate: true } }, sale: { select: { saleDate: true } } },
  });
  const stale = vehicles.map((v) => ({ v, days: daysInStock(v, now) })).filter((x) => x.days >= staleDays);
  if (!stale.length) return [];
  const recent = await prisma.priceSuggestion.findMany({
    where: { dealershipId, vehicleId: { in: stale.map((x) => x.v.id) }, createdAt: { gte: new Date(now.getTime() - COOLDOWN_MS) } },
    select: { vehicleId: true },
  });
  const skip = new Set(recent.map((r) => r.vehicleId));
  return stale.filter((x) => !skip.has(x.v.id)).sort((a, b) => b.days - a.days).map((x) => x.v);
}

/** The daily job: check each opted-in dealership's stale vehicles and tell its owners and managers. */
export async function runDailyPriceChecks() {
  const dealerships = await prisma.dealership.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  for (const dealership of dealerships) {
    try {
      const settings = await getDealershipSettings(dealership.id);
      if (!settings.pricing?.enabled) continue;
      if (!(await resolveOpenAiKey(dealership.id))) continue;
      const vehicles = (await findStaleVehicles(dealership.id, settings.pricing.staleDays)).slice(0, MAX_PER_DEALERSHIP_PER_RUN);
      const found = [];
      for (const vehicle of vehicles) {
        const result = await checkVehicle(vehicle.id, dealership.id);
        if (result.record?.status === 'PENDING') found.push({ vehicle, record: result.record });
      }
      if (!found.length) continue;
      const lines = found.slice(0, 5).map(({ vehicle, record }) => `${vehicle.year} ${vehicle.make} ${vehicle.model}: ${record.currentPrice ? money(record.currentPrice) : 'no price'} → ${money(record.suggestedPrice)}`);
      const alert = {
        title: `Price check: ${found.length} unsold vehicle${found.length > 1 ? 's' : ''} may need a new price`,
        message: `${lines.join('; ')}${found.length > 5 ? `; and ${found.length - 5} more` : ''}. Open the vehicle to review the market suggestion.`,
        severity: 'MEDIUM',
      };
      await prisma.notification.create({ data: { type: 'PRICE_SUGGESTION', ...alert, dealershipId: dealership.id } });
      dispatchNotification({ dealershipId: dealership.id, event: 'manualAlerts', type: 'PRICE_SUGGESTION', ...alert }).catch((e) => console.error('[Pricing] Alert failed:', e.message));
    } catch (err) {
      console.error(`[Pricing] Check failed for ${dealership.name}:`, err.message);
    }
  }
}
