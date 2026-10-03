import express from 'express';
import prisma from '../db/prisma.js';
import { authorizeRoles } from '../middlewares/authMiddleware.js';
import { SUPPORTED_CHANNELS } from '../services/channels/publishers.js';
import {
  ACTIVE_STATUSES,
  CONDITIONS,
  buildListingCopy,
  listingStatus,
  publicListingPath,
  publishListing,
  resolvePublicOrigin,
  syncSoldListings,
} from '../services/marketing.js';

const router = express.Router();

// Marketing is an Admin/Manager module in the UI; enforce that here too.
router.use(authorizeRoles('ADMIN', 'MANAGER', 'SUPER_ADMIN'));

const MAX_PHOTOS = 20;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function normalizeVin(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

function toNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));

// Photo ids are stored on the listing; listings from before photos moved out still hold
// data/http URLs, which are passed through untouched.
export function photoUrl(ref) {
  return isObjectId(ref) ? `/api/public/marketing-photos/${ref}` : ref;
}

function serializeListing(listing) {
  return {
    ...listing,
    status: listingStatus(listing),
    photoUrls: (listing.photos || []).map(photoUrl),
    publicPath: publicListingPath(listing.id),
  };
}

function parseChannels(input, fallback = SUPPORTED_CHANNELS) {
  if (!Array.isArray(input)) return fallback;
  const channels = [...new Set(input.map(String))].filter((c) => SUPPORTED_CHANNELS.includes(c));
  return channels;
}

// Validates uploaded photos (data URLs) and stores each in its own document.
async function storePhotos(photos, dealershipId, listingId) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const ids = [];
  for (const photo of photos) {
    const match = PHOTO_DATA_URL.exec(String(photo));
    if (!match) throw Object.assign(new Error('Photos must be JPEG, PNG or WebP images.'), { status: 400 });
    if ((match[2].length * 3) / 4 > MAX_PHOTO_BYTES) {
      throw Object.assign(new Error('Each photo must be under 4 MB.'), { status: 400 });
    }
    const row = await prisma.marketingPhoto.create({
      data: { mimeType: match[1], dataBase64: match[2], dealershipId, listingId },
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}

async function findOwnListing(req) {
  if (!isObjectId(req.params.id)) return null;
  return prisma.marketingListing.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
}

// ── Listings ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    await syncSoldListings(req.dealershipId);
    const rows = await prisma.marketingListing.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(serializeListing));
  } catch (err) {
    // Surface the failure; returning [] made the page claim there were no listings.
    next(err);
  }
});

router.get('/options', (req, res) => {
  res.json({ channels: SUPPORTED_CHANNELS, conditions: CONDITIONS });
});

router.post('/generate', async (req, res, next) => {
  try {
    const vehicleId = req.body.vehicleId ? String(req.body.vehicleId) : null;
    let vin = normalizeVin(req.body.vin);
    let vehicleSpecs = String(req.body.vehicleSpecs || '').trim();
    let mileage = toNumber(req.body.mileage);
    let price = toNumber(req.body.pricing);
    const condition = String(req.body.condition || '').trim();
    const channels = parseChannels(req.body.channels);
    let vehicle = null;

    if (vehicleId) {
      vehicle = isObjectId(vehicleId)
        ? await prisma.vehicle.findFirst({
            where: { id: vehicleId, dealershipId: req.dealershipId },
            select: { id: true, vin: true, year: true, make: true, model: true, color: true, mileage: true, status: true, askingPrice: true, sale: { select: { id: true } } },
          })
        : null;
      if (!vehicle) return res.status(404).json({ message: 'Vehicle not found for this dealership' });
      if (vehicle.status === 'Sold' || vehicle.sale) {
        return res.status(400).json({ message: 'This vehicle has been sold and cannot be advertised.' });
      }

      vin = vin || normalizeVin(vehicle.vin);
      vehicleSpecs = vehicleSpecs || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
      mileage = mileage ?? Number(vehicle.mileage || 0);
      // Never the purchase cost: that advertised the car at what the dealer paid for it.
      price = price ?? vehicle.askingPrice ?? null;
    }

    if (!vin || !vehicleSpecs || mileage === null || mileage < 0) {
      return res.status(400).json({ message: 'VIN, vehicle specs and mileage are required.' });
    }
    if (!price || price <= 0) {
      return res.status(400).json({ message: 'Enter the asking price to advertise.' });
    }
    if (!CONDITIONS.includes(condition)) {
      return res.status(400).json({ message: `Condition must be one of: ${CONDITIONS.join(', ')}` });
    }
    if (channels.length === 0) {
      return res.status(400).json({ message: 'Choose at least one channel.' });
    }

    const duplicate = await prisma.marketingListing.findFirst({
      where: {
        dealershipId: req.dealershipId,
        OR: [{ status: { in: ACTIVE_STATUSES } }, { status: null }],
        AND: [{ OR: [{ vin }, ...(vehicleId ? [{ vehicleId }] : [])] }],
      },
      select: { id: true, seoTitle: true },
    });
    if (duplicate) {
      return res.status(409).json({
        message: 'This vehicle already has an active listing. Edit or archive it instead.',
        existingListingId: duplicate.id,
      });
    }

    const specYear = vehicleSpecs.match(/\b(?:19|20)\d{2}\b/)?.[0];
    const specWords = vehicleSpecs.replace(/\b(?:19|20)\d{2}\b/, '').trim().split(/\s+/);
    const copy = await buildListingCopy({
      vehicleSpecs,
      year: vehicle?.year ?? (specYear ? Number(specYear) : null),
      make: vehicle?.make || specWords[0] || '',
      model: vehicle?.model || specWords[1] || '',
      color: vehicle?.color || null,
      mileage,
      condition,
      price,
    });

    const photoIds = await storePhotos(req.body.photos, req.dealershipId, null);
    const created = await prisma.marketingListing.create({
      data: {
        vehicleId,
        vin,
        vehicleSpecs,
        photos: photoIds,
        mileage: Math.round(mileage),
        condition,
        pricing: price,
        channels,
        seoTitle: copy.seoTitle,
        description: copy.description,
        hashtags: copy.hashtags,
        featureBullets: copy.featureBullets,
        adCopy: copy.adCopy,
        ctaOptimization: copy.ctaOptimization,
        copySource: copy.copySource,
        status: 'DRAFT',
        scheduledPosts: [],
        analytics: { views: 0, inquiries: 0, byChannel: {} },
        leadAttribution: { publicOrigin: resolvePublicOrigin(req) },
        dealershipId: req.dealershipId,
      },
    });
    if (photoIds.length) {
      await prisma.marketingPhoto.updateMany({ where: { id: { in: photoIds } }, data: { listingId: created.id } });
    }
    // Remember the price on the vehicle so the next listing (and the inventory) use it.
    if (vehicle && !vehicle.askingPrice) {
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: { askingPrice: price } });
    }

    res.status(201).json(serializeListing(created));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const listing = await findOwnListing(req);
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });
    if (listingStatus(listing) === 'ARCHIVED') {
      return res.status(400).json({ message: 'Archived listings cannot be edited.' });
    }

    const data = {};
    for (const field of ['seoTitle', 'description', 'adCopy']) {
      if (req.body[field] !== undefined) {
        const value = String(req.body[field]).trim();
        if (!value) return res.status(400).json({ message: `${field} cannot be empty.` });
        data[field] = value.slice(0, 5000);
      }
    }
    for (const field of ['featureBullets', 'hashtags']) {
      if (req.body[field] !== undefined) {
        if (!Array.isArray(req.body[field])) return res.status(400).json({ message: `${field} must be a list.` });
        data[field] = req.body[field].map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20);
      }
    }
    if (req.body.pricing !== undefined) {
      const price = toNumber(req.body.pricing);
      if (!price || price <= 0) return res.status(400).json({ message: 'Asking price must be greater than zero.' });
      data.pricing = price;
    }
    if (req.body.mileage !== undefined) {
      const mileage = toNumber(req.body.mileage);
      if (mileage === null || mileage < 0) return res.status(400).json({ message: 'Mileage is invalid.' });
      data.mileage = Math.round(mileage);
    }
    if (req.body.condition !== undefined) {
      if (!CONDITIONS.includes(req.body.condition)) {
        return res.status(400).json({ message: `Condition must be one of: ${CONDITIONS.join(', ')}` });
      }
      data.condition = req.body.condition;
    }
    if (req.body.channels !== undefined) {
      const channels = parseChannels(req.body.channels, []);
      if (!channels.length) return res.status(400).json({ message: 'Choose at least one channel.' });
      data.channels = channels;
    }

    let photos = listing.photos || [];
    if (Array.isArray(req.body.removePhotos) && req.body.removePhotos.length) {
      const remove = new Set(req.body.removePhotos.map(String));
      const removedIds = photos.filter((p) => remove.has(p) && isObjectId(p));
      photos = photos.filter((p) => !remove.has(p));
      if (removedIds.length) {
        await prisma.marketingPhoto.deleteMany({ where: { id: { in: removedIds }, dealershipId: req.dealershipId } });
      }
    }
    if (Array.isArray(req.body.addPhotos) && req.body.addPhotos.length) {
      if (photos.length + req.body.addPhotos.length > MAX_PHOTOS) {
        return res.status(400).json({ message: `A listing can have at most ${MAX_PHOTOS} photos.` });
      }
      photos = [...photos, ...(await storePhotos(req.body.addPhotos, req.dealershipId, listing.id))];
    }
    if (photos !== listing.photos) data.photos = photos;

    const updated = await prisma.marketingListing.update({ where: { id: listing.id }, data });
    res.json(serializeListing(updated));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

// Publish now, or schedule for later with { scheduleAt }. The server's cron publishes
// scheduled listings when their time comes.
router.post('/:id/publish', async (req, res, next) => {
  try {
    const listing = await findOwnListing(req);
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });
    if (listingStatus(listing) === 'ARCHIVED') {
      return res.status(400).json({ message: 'Archived listings cannot be published.' });
    }
    if (listing.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: listing.vehicleId, dealershipId: req.dealershipId },
        select: { status: true, sale: { select: { id: true } } },
      });
      if (!vehicle || vehicle.status === 'Sold' || vehicle.sale) {
        return res.status(400).json({ message: 'This vehicle is no longer for sale.' });
      }
    }

    const channels = parseChannels(req.body.channels, listing.channels);
    if (!channels.length) return res.status(400).json({ message: 'Choose at least one channel.' });

    // Links must point at whichever frontend the staff member is using right now.
    const origin = resolvePublicOrigin(req);
    const current = await prisma.marketingListing.update({
      where: { id: listing.id },
      data: { leadAttribution: { ...(listing.leadAttribution || {}), ...(origin ? { publicOrigin: origin } : {}) } },
    });

    if (req.body.scheduleAt) {
      const when = new Date(req.body.scheduleAt);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ message: 'Schedule time is invalid.' });
      if (when.getTime() > Date.now() + 60 * 1000) {
        const updated = await prisma.marketingListing.update({
          where: { id: listing.id },
          data: { status: 'SCHEDULED', scheduledFor: when, channels },
        });
        return res.json(serializeListing(updated));
      }
    }

    res.json(serializeListing(await publishListing(current, channels)));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    const listing = await findOwnListing(req);
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });
    const updated = await prisma.marketingListing.update({
      where: { id: listing.id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), archivedReason: 'Archived manually', scheduledFor: null },
    });
    res.json(serializeListing(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const listing = await findOwnListing(req);
    if (!listing) return res.status(404).json({ message: 'Marketing listing not found' });
    // Leads are kept: they are real people who contacted the dealership.
    await prisma.marketingPhoto.deleteMany({ where: { listingId: listing.id, dealershipId: req.dealershipId } });
    await prisma.marketingListing.delete({ where: { id: listing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Leads ────────────────────────────────────────────────────────────────────────────────

router.get('/leads/list', async (req, res, next) => {
  try {
    const leads = await prisma.marketingLead.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const listingIds = [...new Set(leads.map((l) => l.listingId))];
    const listings = await prisma.marketingListing.findMany({
      where: { id: { in: listingIds }, dealershipId: req.dealershipId },
      select: { id: true, seoTitle: true, vehicleSpecs: true },
    });
    const titles = new Map(listings.map((l) => [l.id, l.vehicleSpecs || l.seoTitle]));
    res.json(leads.map((lead) => ({ ...lead, status: lead.status || 'NEW', listingTitle: titles.get(lead.listingId) || null })));
  } catch (err) {
    next(err);
  }
});

router.patch('/leads/:id', async (req, res, next) => {
  try {
    if (!['NEW', 'CONTACTED'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Status must be NEW or CONTACTED.' });
    }
    const { count } = await prisma.marketingLead.updateMany({
      where: { id: req.params.id, dealershipId: req.dealershipId, NOT: { status: 'CONVERTED' } },
      data: { status: req.body.status },
    });
    if (!count) return res.status(404).json({ message: 'Lead not found' });
    res.json({ id: req.params.id, status: req.body.status });
  } catch (err) {
    next(err);
  }
});

// Turns a lead into a customer record (or links the existing one with the same contact).
router.post('/leads/:id/convert', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Lead not found' });
    const lead = await prisma.marketingLead.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (lead.customerId) return res.json({ customerId: lead.customerId, existing: true });

    const contactMatch = [
      ...(lead.leadEmail ? [{ email: lead.leadEmail }] : []),
      ...(lead.leadPhone ? [{ phone: lead.leadPhone }] : []),
    ];
    let customer = contactMatch.length
      ? await prisma.customer.findFirst({ where: { dealershipId: req.dealershipId, OR: contactMatch } })
      : null;
    const existing = Boolean(customer);

    if (!customer) {
      const [firstName, ...rest] = String(lead.leadName || 'Marketing lead').trim().split(/\s+/);
      customer = await prisma.customer.create({
        data: {
          firstName,
          lastName: rest.join(' ') || null,
          email: lead.leadEmail || null,
          phone: lead.leadPhone || null,
          notes: [`Inquiry via ${lead.source}${lead.campaign ? ` (${lead.campaign})` : ''}.`, lead.message].filter(Boolean).join('\n'),
          source: 'marketing',
          dealershipId: req.dealershipId,
        },
      });
    }

    await prisma.marketingLead.update({ where: { id: lead.id }, data: { status: 'CONVERTED', customerId: customer.id } });
    res.status(existing ? 200 : 201).json({ customerId: customer.id, existing });
  } catch (err) {
    next(err);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

router.get('/summary', async (req, res, next) => {
  try {
    await syncSoldListings(req.dealershipId);
    const [listings, leads, ads] = await Promise.all([
      prisma.marketingListing.findMany({
        where: { dealershipId: req.dealershipId },
        select: { id: true, vehicleId: true, status: true, scheduledPosts: true },
      }),
      prisma.marketingLead.findMany({
        where: { dealershipId: req.dealershipId },
        select: { listingId: true, createdAt: true },
      }),
      prisma.advertisingExpense.findMany({ where: { dealershipId: req.dealershipId } }),
    ]);

    const statusOf = (l) => listingStatus(l);
    const weekAgo = Date.now() - 7 * DAY;
    const totalSpend = ads.reduce((sum, ad) => sum + (ad.amountSpent || 0), 0);

    // A campaign's results are the leads on its linked vehicle's listings during the campaign,
    // and that vehicle's sale if it sold within the campaign window (plus a week of tail).
    const listingsByVehicle = new Map();
    for (const l of listings) {
      if (!l.vehicleId) continue;
      if (!listingsByVehicle.has(l.vehicleId)) listingsByVehicle.set(l.vehicleId, new Set());
      listingsByVehicle.get(l.vehicleId).add(l.id);
    }
    const linkedVehicleIds = [...new Set(ads.map((a) => a.linkedVehicleId).filter(Boolean))];
    const sales = linkedVehicleIds.length
      ? await prisma.sale.findMany({
          where: { dealershipId: req.dealershipId, vehicleId: { in: linkedVehicleIds } },
          select: { vehicleId: true, salePrice: true, profit: true, saleDate: true },
        })
      : [];
    const saleByVehicle = new Map(sales.map((s) => [s.vehicleId, s]));

    const campaigns = ads.map((ad) => {
      if (!ad.linkedVehicleId) return { id: ad.id, attributable: false };
      const start = new Date(ad.startDate).getTime();
      const end = new Date(ad.endDate).getTime() + DAY;
      const listingIds = listingsByVehicle.get(ad.linkedVehicleId) || new Set();
      const campaignLeads = leads.filter((lead) => {
        const t = new Date(lead.createdAt).getTime();
        return listingIds.has(lead.listingId) && t >= start && t <= end;
      }).length;
      const sale = saleByVehicle.get(ad.linkedVehicleId);
      const soldInWindow = sale && new Date(sale.saleDate).getTime() >= start && new Date(sale.saleDate).getTime() <= end + 7 * DAY;
      return {
        id: ad.id,
        attributable: true,
        leads: campaignLeads,
        costPerLead: campaignLeads ? ad.amountSpent / campaignLeads : null,
        sold: Boolean(soldInWindow),
        saleRevenue: soldInWindow ? sale.salePrice : null,
        returnOnAdSpend: soldInWindow && ad.amountSpent > 0 ? sale.salePrice / ad.amountSpent : null,
      };
    });

    const channelStatus = {};
    for (const l of listings) {
      if (statusOf(l) !== 'PUBLISHED' || !Array.isArray(l.scheduledPosts)) continue;
      for (const post of l.scheduledPosts) {
        if (!post?.channel) continue;
        channelStatus[post.channel] = channelStatus[post.channel] || { posted: 0, notConnected: 0, failed: 0 };
        if (post.status === 'POSTED') channelStatus[post.channel].posted += 1;
        else if (post.status === 'FAILED') channelStatus[post.channel].failed += 1;
        else channelStatus[post.channel].notConnected += 1;
      }
    }

    res.json({
      listings: {
        published: listings.filter((l) => statusOf(l) === 'PUBLISHED').length,
        scheduled: listings.filter((l) => statusOf(l) === 'SCHEDULED').length,
        drafts: listings.filter((l) => statusOf(l) === 'DRAFT').length,
        archived: listings.filter((l) => statusOf(l) === 'ARCHIVED').length,
      },
      leads: {
        total: leads.length,
        thisWeek: leads.filter((l) => new Date(l.createdAt).getTime() >= weekAgo).length,
      },
      spend: {
        total: totalSpend,
        active: ads.filter((a) => (a.status || 'Active') === 'Active').reduce((s, a) => s + (a.amountSpent || 0), 0),
      },
      costPerLead: leads.length ? totalSpend / leads.length : null,
      campaigns,
      channelStatus,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
