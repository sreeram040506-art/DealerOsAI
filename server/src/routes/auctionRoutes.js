import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

function computeRecommendedMaxBid({ estimatedValue, transportEstimate }) {
  const value = Number(estimatedValue || 0);
  const transport = Number(transportEstimate || 0);
  if (!value) return null;
  return Math.max(0, Number((value * 0.84 - transport).toFixed(2)));
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.auctionVehicle.findMany({
      where: { dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { auctionSource, laneNumber, vin, estimatedValue, maxBid, transportEstimate, status, notes } = req.body;
    if (!auctionSource) return res.status(400).json({ message: 'auctionSource is required' });
    const row = await prisma.auctionVehicle.create({
      data: {
        auctionSource,
        laneNumber: laneNumber || null,
        vin: vin || null,
        estimatedValue: estimatedValue ?? null,
        maxBid: maxBid ?? null,
        transportEstimate: transportEstimate ?? null,
        recommendedMaxBid: computeRecommendedMaxBid({ estimatedValue, transportEstimate }),
        status: status || 'WATCHLIST',
        notes: notes || null,
        dealershipId: req.dealershipId,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.auctionVehicle.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!existing) return res.status(404).json({ message: 'Auction vehicle not found' });
    const merged = { ...existing, ...req.body };
    const row = await prisma.auctionVehicle.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        recommendedMaxBid: computeRecommendedMaxBid(merged),
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.auctionVehicle.deleteMany({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!result.count) return res.status(404).json({ message: 'Auction vehicle not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
