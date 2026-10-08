import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../db/prisma.js';
import { FORMS, FORM_TYPES, publicDefinition, validateSubmission } from '../services/formDefinitions.js';
import { renderFormPdf, renderStickerPdf, renderHangtagPdf } from '../services/formPdf.js';
import { dispatchNotification } from '../services/notificationDispatcher.js';

const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));
const isToken = (value) => /^[A-Za-z0-9_-]{43}$/.test(String(value || ''));
const DAY = 24 * 60 * 60 * 1000;

const num = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : NaN;
};

function stateOf(request) {
  if (request.status === 'PENDING' && request.expiresAt.getTime() < Date.now()) return 'EXPIRED';
  return request.status;
}

const vehicleSelect = { id: true, vin: true, year: true, make: true, model: true, color: true, mileage: true, stockNumber: true, askingPrice: true };
const dealerSelect = { name: true, phone: true, email: true, address: true, isActive: true };

async function logToRegistry({ dealershipId, vehicle, registryType, pdf, fileName }) {
  return prisma.documentRegistry.create({
    data: {
      dealershipId,
      vin: vehicle?.vin ?? null,
      make: vehicle?.make ?? null,
      model: vehicle?.model ?? null,
      year: vehicle?.year != null ? String(vehicle.year) : null,
      color: vehicle?.color ?? null,
      mileage: vehicle?.mileage != null ? String(vehicle.mileage) : null,
      documentType: registryType,
      documentBase64: pdf.toString('base64'),
      sourceFileName: fileName,
    },
    select: { id: true },
  });
}

const fileNameFor = (label, vehicle) => `${label}_${(vehicle?.vin || 'vehicle').slice(-6)}.pdf`.replace(/[^\w.\-]+/g, '_');

// ── Staff side: create and manage links, generate sticker / hangtag ─────────────────────────

export const staffRouter = express.Router();

staffRouter.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.formRequest.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, token: true, formType: true, status: true, recipientName: true, recipientEmail: true, vehicleId: true, expiresAt: true, submittedAt: true, registryId: true, createdAt: true },
    });
    const ids = [...new Set(rows.map((r) => r.vehicleId).filter(Boolean))];
    const vehicles = ids.length ? await prisma.vehicle.findMany({ where: { id: { in: ids }, dealershipId: req.dealershipId }, select: vehicleSelect }) : [];
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    res.json(rows.map((r) => {
      const state = stateOf(r);
      const vehicle = byId.get(r.vehicleId);
      return {
        id: r.id, formType: r.formType, title: FORMS[r.formType]?.title || r.formType, state,
        recipientName: r.recipientName, recipientEmail: r.recipientEmail,
        vehicleLabel: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null,
        expiresAt: r.expiresAt, submittedAt: r.submittedAt, createdAt: r.createdAt, registryId: r.registryId,
        // Only a link that can still be used is handed back.
        path: state === 'PENDING' ? `/f/${r.token}` : null,
      };
    }));
  } catch (err) { next(err); }
});

staffRouter.post('/', async (req, res, next) => {
  try {
    const { formType, vehicleId, recipientName, recipientEmail, terms, expiresInDays } = req.body || {};
    if (!FORM_TYPES.includes(formType)) return res.status(400).json({ message: 'Choose a form to send.' });
    if (!isObjectId(vehicleId)) return res.status(400).json({ message: 'Choose the vehicle this form is for.' });
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, dealershipId: req.dealershipId }, select: { id: true } });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    let cleanTerms;
    if (terms && typeof terms === 'object') {
      cleanTerms = {};
      for (const key of ['cashPrice', 'docFee', 'taxAndFees', 'addOns', 'tradeAllowance']) {
        const n = num(terms[key]);
        if (Number.isNaN(n)) return res.status(400).json({ message: 'Price terms must be positive numbers.' });
        if (n !== undefined) cleanTerms[key] = n;
      }
    }
    const days = Math.min(30, Math.max(1, Number(expiresInDays) || 7));
    const token = crypto.randomBytes(32).toString('base64url');
    const created = await prisma.formRequest.create({
      data: {
        token, formType, status: 'PENDING', vehicleId,
        recipientName: String(recipientName || '').trim().slice(0, 120) || null,
        recipientEmail: String(recipientEmail || '').trim().slice(0, 160) || null,
        terms: cleanTerms ?? undefined,
        expiresAt: new Date(Date.now() + days * DAY),
        createdById: isObjectId(req.user?.id) ? req.user.id : undefined,
        dealershipId: req.dealershipId,
      },
      select: { id: true, expiresAt: true },
    });
    res.status(201).json({ id: created.id, path: `/f/${token}`, expiresAt: created.expiresAt });
  } catch (err) { next(err); }
});

staffRouter.post('/:id/revoke', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
    const result = await prisma.formRequest.updateMany({ where: { id: req.params.id, dealershipId: req.dealershipId, status: 'PENDING' }, data: { status: 'REVOKED' } });
    if (!result.count) return res.status(404).json({ message: 'Only a link that has not been filled in can be cancelled.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Window sticker and hangtag come straight from the inventory record, no link needed.
staffRouter.post('/generate/:kind', async (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!['sticker', 'hangtag'].includes(kind)) return res.status(404).json({ message: 'Unknown form.' });
    if (!isObjectId(req.body?.vehicleId)) return res.status(400).json({ message: 'Choose a vehicle.' });
    const [vehicle, dealership] = await Promise.all([
      prisma.vehicle.findFirst({ where: { id: req.body.vehicleId, dealershipId: req.dealershipId }, select: vehicleSelect }),
      prisma.dealership.findUnique({ where: { id: req.dealershipId }, select: dealerSelect }),
    ]);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    const pdf = kind === 'sticker' ? await renderStickerPdf({ vehicle, dealership }) : await renderHangtagPdf({ vehicle, dealership });
    const label = kind === 'sticker' ? 'Window_Sticker' : 'Hangtag';
    await logToRegistry({ dealershipId: req.dealershipId, vehicle, registryType: kind === 'sticker' ? 'Window Sticker' : 'Hangtag', pdf, fileName: fileNameFor(label, vehicle) });
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Content-Disposition': `attachment; filename="${fileNameFor(label, vehicle)}"` });
    res.end(pdf);
  } catch (err) { next(err); }
});

// ── Public side: what the customer or mechanic opens ────────────────────────────────────────

export const publicRouter = express.Router();
const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const submitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { message: 'Too many submissions from this network. Please try again later.' } });

async function loadRequest(token) {
  if (!isToken(token)) return null;
  return prisma.formRequest.findUnique({ where: { token } });
}

publicRouter.get('/:token', readLimiter, async (req, res, next) => {
  try {
    const request = await loadRequest(req.params.token);
    if (!request) return res.status(404).json({ message: 'This link is not valid.' });
    const state = stateOf(request);
    if (state === 'SUBMITTED') return res.status(409).json({ state, message: 'This form has already been submitted. Thank you!' });
    if (state !== 'PENDING') return res.status(410).json({ state, message: 'This link is no longer active. Please ask the dealership for a new one.' });
    const form = FORMS[request.formType];
    if (!form) return res.status(404).json({ message: 'This link is not valid.' });

    const [dealership, vehicle] = await Promise.all([
      prisma.dealership.findUnique({ where: { id: request.dealershipId }, select: dealerSelect }),
      request.vehicleId ? prisma.vehicle.findFirst({ where: { id: request.vehicleId, dealershipId: request.dealershipId }, select: vehicleSelect }) : null,
    ]);
    if (!dealership?.isActive) return res.status(410).json({ state: 'REVOKED', message: 'This link is no longer active.' });

    res.json({
      state: 'PENDING',
      form: publicDefinition(form),
      recipientName: request.recipientName,
      terms: request.formType === 'PURCHASE_CONTRACT' ? request.terms ?? null : null,
      dealership: { name: dealership.name, phone: dealership.phone, email: dealership.email, address: dealership.address },
      // Only what is printed on the car's own window, never cost or internal data.
      vehicle: vehicle ? { year: vehicle.year, make: vehicle.make, model: vehicle.model, color: vehicle.color, vin: vehicle.vin, mileage: vehicle.mileage, stockNumber: vehicle.stockNumber } : null,
      expiresAt: request.expiresAt,
    });
  } catch (err) { next(err); }
});

publicRouter.post('/:token', submitLimiter, async (req, res, next) => {
  let claimed = null;
  try {
    if (Number(req.headers['content-length'] || 0) > 100 * 1024) return res.status(413).json({ message: 'That submission is too large.' });
    const request = await loadRequest(req.params.token);
    if (!request) return res.status(404).json({ message: 'This link is not valid.' });
    const state = stateOf(request);
    if (state === 'SUBMITTED') return res.status(409).json({ state, message: 'This form has already been submitted.' });
    if (state !== 'PENDING') return res.status(410).json({ state, message: 'This link is no longer active.' });
    const form = FORMS[request.formType];

    const result = validateSubmission(form, req.body);
    if (result.errors) return res.status(400).json({ message: 'Please fix the highlighted fields.', errors: result.errors });

    // One submission per link: whoever flips PENDING -> SUBMITTED first wins.
    const now = new Date();
    const claim = await prisma.formRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: 'SUBMITTED', submittedAt: now } });
    if (!claim.count) return res.status(409).json({ state: 'SUBMITTED', message: 'This form has already been submitted.' });
    claimed = request.id;

    const [dealership, vehicle] = await Promise.all([
      prisma.dealership.findUnique({ where: { id: request.dealershipId }, select: dealerSelect }),
      request.vehicleId ? prisma.vehicle.findFirst({ where: { id: request.vehicleId, dealershipId: request.dealershipId }, select: vehicleSelect }) : null,
    ]);
    const pdf = await renderFormPdf({ formType: request.formType, form, data: result.data, vehicle, dealership, terms: request.terms, submittedAt: now });
    const registry = await logToRegistry({ dealershipId: request.dealershipId, vehicle, registryType: form.registryType, pdf, fileName: fileNameFor(form.registryType.replace(/\s+/g, '_'), vehicle) });
    await prisma.formRequest.update({
      where: { id: request.id },
      // A credit application holds personal data; the PDF is the record, so the raw answers are not kept.
      data: { registryId: registry.id, data: form.sensitive ? null : result.data },
    });

    const who = result.data.buyerName || result.data.applicantName || result.data.inspectorName || request.recipientName || 'Someone';
    const alert = {
      title: `${form.title} submitted`,
      message: `${who} filled in the ${form.title.toLowerCase()}${vehicle ? ` for the ${vehicle.year} ${vehicle.make} ${vehicle.model}` : ''}. It is in the Vehicle Database.`,
      severity: 'MEDIUM',
    };
    await prisma.notification.create({ data: { type: 'FORM_SUBMITTED', ...alert, dealershipId: request.dealershipId } }).catch(() => {});
    dispatchNotification({ dealershipId: request.dealershipId, event: 'manualAlerts', type: 'FORM_SUBMITTED', ...alert }).catch((err) => console.error('[Forms] Alert failed:', err.message));

    res.status(201).json({ ok: true });
  } catch (err) {
    // The form could not be produced: let them try again with the same link.
    if (claimed) await prisma.formRequest.updateMany({ where: { id: claimed, registryId: null }, data: { status: 'PENDING', submittedAt: null } }).catch(() => {});
    next(err);
  }
});

// PDF of a submitted form, for staff (shares the Vehicle Database download).
staffRouter.get('/:id/pdf', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
    const request = await prisma.formRequest.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId }, select: { registryId: true, formType: true } });
    if (!request?.registryId) return res.status(404).json({ message: 'This form has not been submitted yet.' });
    const doc = await prisma.documentRegistry.findFirst({ where: { id: request.registryId, dealershipId: req.dealershipId }, select: { documentBase64: true, sourceFileName: true } });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    const buffer = Buffer.from(doc.documentBase64, 'base64');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': buffer.length, 'Content-Disposition': `attachment; filename="${doc.sourceFileName || 'form.pdf'}"` });
    res.end(buffer);
  } catch (err) { next(err); }
});
