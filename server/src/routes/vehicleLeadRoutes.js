import express from 'express';
import prisma from '../db/prisma.js';

// Who asked about a vehicle and how much they offered, shown on the vehicle's Leads tab.
const router = express.Router();

const STATUSES = ['Interested', 'Negotiating', 'Won', 'Lost'];
const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

router.param('id', (req, res, next, id) => (isObjectId(id) ? next() : res.status(404).json({ message: 'Lead not found.' })));

/** null = blank (no amount); undefined = invalid. */
function parseAmount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined;
}

router.get('/vehicle/:vehicleId', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.vehicleId)) return res.json([]);
    const leads = await prisma.vehicleLead.findMany({
      where: { vehicleId: req.params.vehicleId, dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(leads);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { vehicleId } = req.body || {};
    const customerName = text(req.body?.customerName, 120);
    if (!isObjectId(vehicleId)) return res.status(400).json({ message: 'Choose a vehicle.' });
    if (!customerName) return res.status(400).json({ message: 'Enter the customer\'s name.' });
    const offerAmount = parseAmount(req.body?.offerAmount);
    if (offerAmount === undefined) return res.status(400).json({ message: 'The amount must be a positive number.' });
    const status = req.body?.status === undefined ? 'Interested' : req.body.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Unknown status.' });
    const email = text(req.body?.email, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, dealershipId: req.dealershipId }, select: { id: true } });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const lead = await prisma.vehicleLead.create({
      data: { vehicleId, customerName, phone: text(req.body?.phone, 40) || null, email: email || null, offerAmount, status, notes: text(req.body?.notes, 1000) || null, dealershipId: req.dealershipId },
    });
    res.status(201).json(lead);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = {};
    if (req.body?.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ message: 'Unknown status.' });
      data.status = req.body.status;
    }
    if (req.body?.offerAmount !== undefined) {
      const amount = parseAmount(req.body.offerAmount);
      if (amount === undefined) return res.status(400).json({ message: 'The amount must be a positive number.' });
      data.offerAmount = amount;
    }
    if (req.body?.notes !== undefined) data.notes = text(req.body.notes, 1000) || null;
    if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to update.' });
    const result = await prisma.vehicleLead.updateMany({ where: { id: req.params.id, dealershipId: req.dealershipId }, data });
    if (!result.count) return res.status(404).json({ message: 'Lead not found.' });
    res.json(await prisma.vehicleLead.findUnique({ where: { id: req.params.id } }));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.vehicleLead.deleteMany({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
