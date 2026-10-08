import express from 'express';
import prisma from '../db/prisma.js';
import { authorizeManagerOrAdmin } from '../middlewares/authMiddleware.js';
import { checkVehicle } from '../services/marketPricing.js';
import { vehicleCache } from '../utils/cache.js';

// Market price suggestions for unsold vehicles. Prices and costs are management information, so
// every route here is for owners (ADMIN) and managers.
const router = express.Router();
router.use(authorizeManagerOrAdmin);

const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));
router.param('id', (req, res, next, id) => (isObjectId(id) ? next() : res.status(404).json({ message: 'Suggestion not found.' })));
router.param('vehicleId', (req, res, next, id) => (isObjectId(id) ? next() : res.status(404).json({ message: 'Vehicle not found.' })));

const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;

// Everything waiting for a decision, for badges and lists.
router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.priceSuggestion.findMany({ where: { dealershipId: req.dealershipId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/vehicle/:vehicleId', async (req, res, next) => {
  try {
    const rows = await prisma.priceSuggestion.findMany({ where: { vehicleId: req.params.vehicleId, dealershipId: req.dealershipId }, orderBy: { createdAt: 'desc' }, take: 5 });
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/vehicle/:vehicleId/check', async (req, res, next) => {
  try {
    const last = await prisma.priceSuggestion.findFirst({ where: { vehicleId: req.params.vehicleId, dealershipId: req.dealershipId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (last && Date.now() - last.createdAt.getTime() < MANUAL_COOLDOWN_MS) {
      return res.status(429).json({ message: 'This vehicle was checked less than an hour ago. Please try again later.' });
    }
    // A new check replaces any older suggestion that is still waiting.
    const result = await checkVehicle(req.params.vehicleId, req.dealershipId);
    if (result.error) return res.status(result.error === 'Vehicle not found.' ? 404 : 400).json({ message: result.error });
    if (result.record.status !== 'PENDING') return res.json(result.record);
    await prisma.priceSuggestion.updateMany({ where: { vehicleId: req.params.vehicleId, dealershipId: req.dealershipId, status: 'PENDING', id: { not: result.record.id } }, data: { status: 'DISMISSED', decidedAt: new Date() } });
    res.json(result.record);
  } catch (err) { next(err); }
});

router.post('/:id/apply', async (req, res, next) => {
  try {
    const suggestion = await prisma.priceSuggestion.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!suggestion || suggestion.status !== 'PENDING' || !suggestion.suggestedPrice) return res.status(404).json({ message: 'This suggestion is no longer available.' });
    // Claim it first so a double click cannot apply twice.
    const claim = await prisma.priceSuggestion.updateMany({ where: { id: suggestion.id, status: 'PENDING' }, data: { status: 'APPLIED', decidedAt: new Date(), decidedById: isObjectId(req.user?.id) ? req.user.id : undefined } });
    if (!claim.count) return res.status(409).json({ message: 'This suggestion was already handled.' });
    await prisma.vehicle.updateMany({ where: { id: suggestion.vehicleId, dealershipId: req.dealershipId }, data: { askingPrice: suggestion.suggestedPrice } });
    vehicleCache.delete(`vehicle-list:${req.dealershipId}`);
    res.json({ ok: true, askingPrice: suggestion.suggestedPrice });
  } catch (err) { next(err); }
});

router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const result = await prisma.priceSuggestion.updateMany({ where: { id: req.params.id, dealershipId: req.dealershipId, status: 'PENDING' }, data: { status: 'DISMISSED', decidedAt: new Date(), decidedById: isObjectId(req.user?.id) ? req.user.id : undefined } });
    if (!result.count) return res.status(404).json({ message: 'This suggestion is no longer available.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
