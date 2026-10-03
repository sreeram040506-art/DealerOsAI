import prisma from '../db/prisma.js';
import { channelPublisherMap, SUPPORTED_CHANNELS } from './channels/publishers.js';
import { getDealershipSecrets, getDealershipSettings, resolveOpenAiKey } from './dealershipSettings.js';

export const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Needs Work'];
export const ACTIVE_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED'];

// Listings created before statuses existed have none; they were "published" by the old flow.
export const listingStatus = (listing) => listing.status || 'PUBLISHED';

export function publicListingPath(listingId, channel) {
  return `/l/${listingId}${channel ? `?src=${encodeURIComponent(channel)}` : ''}`;
}

/** The frontend origin public links should point at (the API may live on another host). */
export function resolvePublicOrigin(req) {
  const fromRequest = req?.headers?.origin;
  if (fromRequest && /^https?:\/\//.test(fromRequest)) return fromRequest.replace(/\/+$/, '');
  const configured = String(process.env.CLIENT_URL || '').split(',')[0].trim();
  return configured.replace(/\/+$/, '');
}

// ── Listing copy ─────────────────────────────────────────────────────────────────────────

// "Low miles" is only claimed when it is true: under the dealership's miles-per-year
// threshold (12k by default) for the vehicle's age.
function isLowMileage(mileage, year, perYear = 12000) {
  const age = Math.max(1, new Date().getFullYear() - (Number(year) || new Date().getFullYear()));
  return mileage > 0 && mileage < age * perYear;
}

function hashtagFor(word) {
  const clean = String(word || '').replace(/[^A-Za-z0-9]/g, '');
  return clean ? `#${clean}` : null;
}

/**
 * Deterministic copy built only from facts we hold. The old template asserted things nobody
 * had checked — "Low Miles" at any mileage, "Fully inspected", "verified miles" — which is a
 * false-advertising risk for a dealer.
 */
export function buildTemplateCopy(facts) {
  const { vehicleSpecs, year, make, model, color, mileage, condition, price } = facts;
  const miles = `${mileage.toLocaleString()} miles`;
  const lowMiles = isLowMileage(mileage, year, facts.lowMileagePerYear);

  const seoTitle = `${vehicleSpecs} | ${mileage.toLocaleString()} mi | $${price.toLocaleString()}`;
  const description = [
    `${vehicleSpecs}${color ? ` in ${color}` : ''}, ${miles}${lowMiles ? ' — low miles for its age' : ''}.`,
    `Condition: ${condition}.`,
    `Asking $${price.toLocaleString()}.`,
    'Contact us to ask questions or schedule a test drive.',
  ].join(' ');
  const featureBullets = [
    `${miles}${lowMiles ? ' (low for its age)' : ''}`,
    `${condition} condition`,
    ...(color ? [`${color} exterior`] : []),
  ];
  const adCopy = `${vehicleSpecs}, ${miles}, asking $${price.toLocaleString()}. Message us to see it in person.`;
  const hashtags = ['#UsedCars', '#ForSale', hashtagFor(make), hashtagFor(model), lowMiles ? '#LowMiles' : null]
    .filter(Boolean);

  return { seoTitle, description, featureBullets, adCopy, hashtags, ctaOptimization: 'Schedule a test drive', copySource: 'TEMPLATE' };
}

/**
 * Writes the description, ad copy, bullets and hashtags with the model when the dealership has
 * AI enabled and a key is available (its own, or the platform's). The title and price stay
 * deterministic, and anything unusable falls back to the template.
 */
export async function buildListingCopy(facts, dealershipId) {
  const settings = dealershipId ? await getDealershipSettings(dealershipId) : null;
  const factsWithThreshold = { ...facts, lowMileagePerYear: settings?.marketing.lowMileagePerYear ?? 12000 };
  const template = buildTemplateCopy(factsWithThreshold);
  const apiKey = await resolveOpenAiKey(dealershipId);
  if (!apiKey) return template;
  facts = factsWithThreshold;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write used-car listings for a dealership. Use ONLY the facts provided. Never claim ' +
              'anything not in the facts: no inspection, accident or service history, warranty, financing, ' +
              'one-owner, certification, or "low miles" unless lowMileage is true. Do not change the price. ' +
              'Reply as JSON: {"description": string (2-4 sentences), "adCopy": string (1-2 sentences), ' +
              '"featureBullets": string[] (3-5 items), "hashtags": string[] (4-7 items, each starting with #)}.',
          },
          { role: 'user', content: JSON.stringify({ ...facts, lowMileage: isLowMileage(facts.mileage, facts.year, facts.lowMileagePerYear) }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
    const data = await response.json();
    const ai = JSON.parse(data?.choices?.[0]?.message?.content || '{}');

    const strings = (value, max) =>
      Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean).slice(0, max) : [];
    const description = typeof ai.description === 'string' ? ai.description.trim() : '';
    const adCopy = typeof ai.adCopy === 'string' ? ai.adCopy.trim() : '';
    const featureBullets = strings(ai.featureBullets, 5);
    const hashtags = strings(ai.hashtags, 7).map((h) => (h.startsWith('#') ? h : `#${h}`)).map((h) => h.replace(/\s+/g, ''));
    if (!description || !adCopy || featureBullets.length === 0) return template;

    return { ...template, description, adCopy, featureBullets, hashtags: hashtags.length ? hashtags : template.hashtags, copySource: 'AI' };
  } catch (err) {
    console.warn('[Marketing] AI copy failed, using template:', err.message);
    return template;
  }
}

// ── Publishing ───────────────────────────────────────────────────────────────────────────

export async function publishListing(listing, channels) {
  const origin = listing.leadAttribution?.publicOrigin || '';
  const [settings, secrets] = await Promise.all([
    getDealershipSettings(listing.dealershipId),
    getDealershipSecrets(listing.dealershipId),
  ]);
  const payload = {
    facebook: { pageId: settings.marketing.facebookPageId, token: secrets.facebookAccessToken },
    title: listing.seoTitle,
    description: listing.description,
    cta: listing.adCopy,
    trackingUrlFor: (channel) => `${origin}${publicListingPath(listing.id, channel)}`,
  };

  const results = [];
  for (const channel of channels) {
    const publisher = channelPublisherMap[channel];
    results.push(publisher
      ? await publisher(payload)
      : { channel, status: 'FAILED', error: 'Unknown channel', at: new Date().toISOString() });
  }

  return prisma.marketingListing.update({
    where: { id: listing.id },
    data: {
      status: 'PUBLISHED',
      channels,
      publishedAt: new Date(),
      scheduledFor: null,
      scheduledPosts: results,
    },
  });
}

/** Publishes listings whose scheduled time has passed. Run by the server's cron. */
export async function publishDueListings() {
  const due = await prisma.marketingListing.findMany({
    where: { status: 'SCHEDULED', scheduledFor: { lte: new Date() } },
  });
  for (const listing of due) {
    try {
      if (await archiveIfVehicleSold(listing)) continue;
      const { marketing } = await getDealershipSettings(listing.dealershipId);
      await publishListing(listing, listing.channels.filter((c) => marketing.enabledChannels.includes(c)));
      console.log(`[Marketing] Published scheduled listing ${listing.id}`);
    } catch (err) {
      console.error(`[Marketing] Scheduled publish failed for ${listing.id}:`, err.message);
    }
  }
  return due.length;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────────────

export async function archiveListingsForVehicle(vehicleId, dealershipId, reason = 'Vehicle sold') {
  if (!vehicleId) return 0;
  const { count } = await prisma.marketingListing.updateMany({
    where: { vehicleId, dealershipId, OR: [{ status: { in: ACTIVE_STATUSES } }, { status: null }] },
    data: { status: 'ARCHIVED', archivedAt: new Date(), archivedReason: reason, scheduledFor: null },
  });
  return count;
}

async function archiveIfVehicleSold(listing) {
  if (!listing.vehicleId) return false;
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: listing.vehicleId, dealershipId: listing.dealershipId },
    select: { status: true, sale: { select: { id: true } } },
  });
  if (vehicle && vehicle.status !== 'Sold' && !vehicle.sale) return false;
  await archiveListingsForVehicle(listing.vehicleId, listing.dealershipId, vehicle ? 'Vehicle sold' : 'Vehicle removed');
  return true;
}

/** Archives this dealership's active listings whose vehicle has been sold or deleted. */
export async function syncSoldListings(dealershipId) {
  const listings = await prisma.marketingListing.findMany({
    where: { dealershipId, vehicleId: { not: null }, OR: [{ status: { in: ACTIVE_STATUSES } }, { status: null }] },
    select: { vehicleId: true },
  });
  const vehicleIds = [...new Set(listings.map((l) => l.vehicleId))];
  if (!vehicleIds.length) return;

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds }, dealershipId },
    select: { id: true, status: true, sale: { select: { id: true } } },
  });
  const stillForSale = new Set(vehicles.filter((v) => v.status !== 'Sold' && !v.sale).map((v) => v.id));
  const present = new Set(vehicles.map((v) => v.id));
  for (const id of vehicleIds) {
    if (!stillForSale.has(id)) {
      await archiveListingsForVehicle(id, dealershipId, present.has(id) ? 'Vehicle sold' : 'Vehicle removed');
    }
  }
}

// ── Analytics ────────────────────────────────────────────────────────────────────────────

export function normalizeSource(src) {
  return SUPPORTED_CHANNELS.includes(src) ? src : 'Direct';
}

/** Increments a counter ('views' or 'inquiries') in total and for the source channel. */
export async function bumpListingMetric(listing, metric, source) {
  const analytics = listing.analytics && typeof listing.analytics === 'object' ? listing.analytics : {};
  const byChannel = { ...(analytics.byChannel || {}) };
  const channelStats = { views: 0, inquiries: 0, ...(byChannel[source] || {}) };
  channelStats[metric] = (channelStats[metric] || 0) + 1;
  byChannel[source] = channelStats;
  await prisma.marketingListing.update({
    where: { id: listing.id },
    data: { analytics: { ...analytics, [metric]: (analytics[metric] || 0) + 1, byChannel } },
  });
}
