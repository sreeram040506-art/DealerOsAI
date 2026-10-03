import express from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../db/prisma.js';
import { bumpListingMetric, listingStatus, normalizeSource } from '../services/marketing.js';
import { photoUrl } from './marketingRoutes.js';

// Unauthenticated routes behind every marketing tracking link: buyers open a listing, it
// counts the view for the channel the link was posted on, and their inquiry becomes a lead.
// Only published listings are exposed, and only the fields a buyer would see in an ad.
const router = express.Router();

const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many inquiries from this network. Please try again later.' },
});

const viewLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

async function findPublicListing(id) {
  if (!isObjectId(id)) return { listing: null, gone: false };
  const listing = await prisma.marketingListing.findUnique({ where: { id } });
  if (!listing) return { listing: null, gone: false };

  const status = listingStatus(listing);
  if (status === 'ARCHIVED') return { listing: null, gone: true };
  if (status !== 'PUBLISHED') return { listing: null, gone: false };

  if (listing.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: listing.vehicleId, dealershipId: listing.dealershipId },
      select: { status: true, sale: { select: { id: true } } },
    });
    if (!vehicle || vehicle.status === 'Sold' || vehicle.sale) return { listing: null, gone: true };
  }
  return { listing, gone: false };
}

function notFound(res, gone) {
  return gone
    ? res.status(410).json({ message: 'This vehicle is no longer available.' })
    : res.status(404).json({ message: 'Listing not found.' });
}

router.get('/listings/:id', async (req, res, next) => {
  try {
    const { listing, gone } = await findPublicListing(req.params.id);
    if (!listing) return notFound(res, gone);

    const dealership = await prisma.dealership.findUnique({
      where: { id: listing.dealershipId },
      select: { name: true, phone: true, email: true, address: true, isActive: true },
    });
    if (!dealership?.isActive) return notFound(res, true);

    res.json({
      id: listing.id,
      title: listing.seoTitle,
      vehicleSpecs: listing.vehicleSpecs,
      vin: listing.vin,
      mileage: listing.mileage,
      condition: listing.condition,
      price: listing.pricing,
      description: listing.description,
      featureBullets: listing.featureBullets,
      photoUrls: (listing.photos || []).map(photoUrl),
      dealership: { name: dealership.name, phone: dealership.phone, email: dealership.email, address: dealership.address },
    });
  } catch (err) {
    next(err);
  }
});

// Separate from the GET so page reloads and prefetches don't inflate the count; the page
// sends this once per browser session.
router.post('/listings/:id/view', viewLimiter, async (req, res, next) => {
  try {
    const { listing } = await findPublicListing(req.params.id);
    if (!listing) return res.status(204).send();
    await bumpListingMetric(listing, 'views', normalizeSource(req.body?.src));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

router.post('/listings/:id/inquiry', inquiryLimiter, async (req, res, next) => {
  try {
    // Honeypot: real visitors never see or fill this field.
    if (req.body?.website) return res.status(201).json({ ok: true });

    const name = clean(req.body?.name, 100);
    const phone = clean(req.body?.phone, 30);
    const email = clean(req.body?.email, 200).toLowerCase();
    const message = clean(req.body?.message, 2000);

    if (!name) return res.status(400).json({ message: 'Please enter your name.' });
    if (!phone && !email) return res.status(400).json({ message: 'Please enter a phone number or email.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const { listing, gone } = await findPublicListing(req.params.id);
    if (!listing) return notFound(res, gone);

    const source = normalizeSource(req.body?.src);
    await prisma.marketingLead.create({
      data: {
        listingId: listing.id,
        source,
        campaign: listing.vehicleSpecs,
        leadName: name,
        leadPhone: phone || null,
        leadEmail: email || null,
        message: message || null,
        status: 'NEW',
        dealershipId: listing.dealershipId,
      },
    });
    await bumpListingMetric(listing, 'inquiries', source);
    await prisma.notification.create({
      data: {
        type: 'MARKETING_LEAD',
        title: `New inquiry: ${listing.vehicleSpecs}`,
        message: `${name} (${phone || email}) via ${source}${message ? `: ${message.slice(0, 200)}` : ''}`,
        severity: 'HIGH',
        dealershipId: listing.dealershipId,
      },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/marketing-photos/:id', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).end();
    const photo = await prisma.marketingPhoto.findUnique({ where: { id: req.params.id } });
    if (!photo) return res.status(404).end();

    const buffer = Buffer.from(photo.dataBase64, 'base64');
    res.set({
      'Content-Type': photo.mimeType,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
      // Helmet defaults to same-origin; listing photos are meant to load on other origins.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
