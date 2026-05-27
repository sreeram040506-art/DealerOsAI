import express from 'express';
import prisma from '../db/prisma.js';
import { channelPublisherMap } from '../services/channels/publishers.js';

const router = express.Router();

const DEFAULT_CHANNELS = [
  'Facebook Marketplace',
  'Instagram',
  'TikTok',
  'Dealer Website',
  'Craigslist',
  'YouTube Shorts',
  'Google Vehicle Listings',
];

function normalizeVin(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function generateHashtags(makeModel = '', condition = '', price = 0) {
  const tokens = String(makeModel).split(/\s+/).filter(Boolean).slice(0, 2);
  return [
    '#UsedCar',
    '#CarDeal',
    '#FinancingAvailable',
    tokens[0] ? `#${tokens[0]}` : '#Vehicle',
    tokens[1] ? `#${tokens[1]}` : '#Inventory',
    condition ? `#${condition.replace(/\s+/g, '')}` : '#GoodCondition',
    price > 0 ? '#PricedToSell' : '#BestValue',
  ];
}

function buildAIOutput({ vin, vehicleSpecs, mileage, condition, pricing }) {
  const seoTitle = `${vehicleSpecs} | Low Miles ${mileage.toLocaleString()} | $${pricing.toLocaleString()}`;
  const description = `VIN ${vin}. ${vehicleSpecs} in ${condition} condition with ${mileage.toLocaleString()} miles. Fully inspected and ready to drive. Competitive pricing at $${pricing.toLocaleString()}.`;
  const hashtags = generateHashtags(vehicleSpecs, condition, pricing);
  const featureBullets = [
    `${mileage.toLocaleString()} verified miles`,
    `${condition} condition`,
    'Clean and professional listing photos',
    'Fast financing options available',
    'Dealer-supported post-sale assistance',
  ];
  const adCopy = `Drive home this ${vehicleSpecs} today for just $${pricing.toLocaleString()}. Message now to reserve before it is gone.`;
  const ctaOptimization = 'Use urgency CTA + lead form: "Book your test drive in 60 seconds."';

  const formattedListing = [
    `Title: ${seoTitle}`,
    `Description: ${description}`,
    'Highlights:',
    ...featureBullets.map((b) => `- ${b}`),
    `Ad Copy: ${adCopy}`,
    `CTA: ${ctaOptimization}`,
    `Hashtags: ${hashtags.join(' ')}`,
  ].join('\n');

  return { seoTitle, description, hashtags, featureBullets, adCopy, ctaOptimization, formattedListing };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.marketingListing.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    console.error('[Marketing List Error]', err?.message || err);
    res.json([]);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    let vehicleId = req.body.vehicleId ? String(req.body.vehicleId) : null;
    let vin = normalizeVin(req.body.vin);
    let vehicleSpecs = String(req.body.vehicleSpecs || '').trim();
    let photos = Array.isArray(req.body.photos) ? req.body.photos.map(String).filter(Boolean) : [];
    let mileage = toNumber(req.body.mileage, null);
    let condition = String(req.body.condition || '').trim();
    let pricing = toNumber(req.body.pricing, null);
    const channels = Array.isArray(req.body.channels) && req.body.channels.length ? req.body.channels : DEFAULT_CHANNELS;

    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, dealershipId: req.dealershipId },
        include: { purchase: true, repairs: true },
      });
      if (!vehicle) return res.status(404).json({ message: 'Vehicle not found for this dealership' });

      vin = vin || normalizeVin(vehicle.vin);
      vehicleSpecs = vehicleSpecs || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
      mileage = mileage !== null ? mileage : Number(vehicle.mileage || 0);
      condition = condition || 'Good';
      pricing = pricing !== null ? pricing : Number(vehicle.purchase?.purchasePrice || 0);
      photos = photos.length ? photos : [];
    }

    if (!vin || !vehicleSpecs || mileage === null || mileage === undefined || !condition || pricing === null || pricing === undefined) {
      return res.status(400).json({ message: 'vin, vehicleSpecs, mileage, condition and pricing are required' });
    }

    const ai = buildAIOutput({ vin, vehicleSpecs, mileage, condition, pricing });
    const trackingUrl = `/inventory?source=marketing&campaign=${encodeURIComponent(vin)}`;
    const scheduledPosts = channels.map((channel, index) => ({
      channel,
      scheduledAt: new Date(Date.now() + index * 60 * 60 * 1000).toISOString(),
      status: 'SCHEDULED',
    }));

    const created = await prisma.marketingListing.create({
      data: {
        vehicleId,
        vin,
        vehicleSpecs,
        photos,
        mileage,
        condition,
        pricing,
        channels,
        ...ai,
        formattedListing: `${ai.formattedListing}\nTracking URL: ${trackingUrl}`,
        scheduledPosts,
        analytics: { impressions: 0, clicks: 0, leads: 0, byChannel: {} },
        leadAttribution: { byChannel: {}, trackingUrl },
        dealershipId: req.dealershipId,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/schedule', async (req, res, next) => {
  try {
    const listing = await prisma.marketingListing.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });

    const scheduledPosts = Array.isArray(req.body.scheduledPosts) ? req.body.scheduledPosts : [];
    const updated = await prisma.marketingListing.update({
      where: { id: req.params.id },
      data: { scheduledPosts },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/analytics', async (req, res, next) => {
  try {
    const listing = await prisma.marketingListing.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });

    const currentAnalytics = (listing.analytics && typeof listing.analytics === 'object') ? listing.analytics : {};
    const currentLeadAttr = (listing.leadAttribution && typeof listing.leadAttribution === 'object') ? listing.leadAttribution : {};
    const nextAnalytics = { ...currentAnalytics, ...(req.body.analytics || {}) };
    const nextLeadAttr = { ...currentLeadAttr, ...(req.body.leadAttribution || {}) };

    const updated = await prisma.marketingListing.update({
      where: { id: req.params.id },
      data: {
        analytics: nextAnalytics,
        leadAttribution: nextLeadAttr,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/publish', async (req, res, next) => {
  try {
    const listing = await prisma.marketingListing.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });

    const requestedChannels = Array.isArray(req.body.channels) && req.body.channels.length ? req.body.channels : listing.channels;
    const results = [];

    for (const channel of requestedChannels) {
      const publisher = channelPublisherMap[channel];
      if (!publisher) {
        results.push({ channel, status: 'SKIPPED', reason: 'No publisher configured' });
        continue;
      }
      const publishResult = await publisher({
        title: listing.seoTitle,
        description: listing.description,
        hashtags: listing.hashtags,
        cta: listing.ctaOptimization,
        trackingUrl: listing.leadAttribution?.trackingUrl || '',
      });
      results.push(publishResult);
    }

    const updated = await prisma.marketingListing.update({
      where: { id: listing.id },
      data: {
        scheduledPosts: results,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/lead', async (req, res, next) => {
  try {
    const listing = await prisma.marketingListing.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });

    const source = String(req.body.source || 'unknown');
    const campaign = req.body.campaign ? String(req.body.campaign) : null;
    const lead = await prisma.marketingLead.create({
      data: {
        listingId: listing.id,
        source,
        campaign,
        leadName: req.body.leadName || null,
        leadPhone: req.body.leadPhone || null,
        leadEmail: req.body.leadEmail || null,
        dealershipId: req.dealershipId,
      },
    });

    const currentAnalytics = (listing.analytics && typeof listing.analytics === 'object') ? listing.analytics : {};
    const currentLeadAttr = (listing.leadAttribution && typeof listing.leadAttribution === 'object') ? listing.leadAttribution : {};
    const byChannel = { ...(currentLeadAttr.byChannel || {}) };
    byChannel[source] = (byChannel[source] || 0) + 1;

    await prisma.marketingListing.update({
      where: { id: listing.id },
      data: {
        analytics: { ...currentAnalytics, leads: (currentAnalytics.leads || 0) + 1 },
        leadAttribution: { ...currentLeadAttr, byChannel },
      },
    });

    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

router.get('/leads/list', async (req, res, next) => {
  try {
    const leads = await prisma.marketingLead.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

export default router;
