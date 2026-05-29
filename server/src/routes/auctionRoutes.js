import express from 'express';
import prisma from '../db/prisma.js';
import { ingestAuctionFeed } from '../services/auctionConnectorService.js';

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

router.post('/import-feed', async (req, res, next) => {
  try {
    const { provider, items } = req.body;
    if (!provider) return res.status(400).json({ message: 'provider is required' });
    if (!Array.isArray(items)) return res.status(400).json({ message: 'items must be an array' });

    const rows = await ingestAuctionFeed({ provider, items, dealershipId: req.dealershipId });
    res.status(201).json({ importedCount: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      auctionSource,
      sourceProvider,
      sourceItemId,
      lotNumber,
      laneNumber,
      vin,
      estimatedValue,
      maxBid,
      transportEstimate,
      condition,
      seller,
      auctionDate,
      status,
      notes,
    } = req.body;

    if (!auctionSource) return res.status(400).json({ message: 'auctionSource is required' });

    const row = await prisma.auctionVehicle.create({
      data: {
        auctionSource,
        sourceProvider: sourceProvider || auctionSource,
        sourceItemId: sourceItemId || null,
        lotNumber: lotNumber || null,
        laneNumber: laneNumber || null,
        vin: vin || null,
        estimatedValue: estimatedValue ?? null,
        maxBid: maxBid ?? null,
        transportEstimate: transportEstimate ?? null,
        condition: condition || null,
        seller: seller || null,
        auctionDate: auctionDate ? new Date(auctionDate) : null,
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

router.patch('/:id/bid', async (req, res, next) => {
  try {
    const existing = await prisma.auctionVehicle.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!existing) return res.status(404).json({ message: 'Auction vehicle not found' });

    const { maxBid, winningBid, bidStatus, status, notes, estimatedValue, transportEstimate } = req.body;
    const merged = { ...existing, ...req.body };

    const row = await prisma.auctionVehicle.update({
      where: { id: req.params.id },
      data: {
        maxBid: typeof maxBid !== 'undefined' ? maxBid : existing.maxBid,
        winningBid: typeof winningBid !== 'undefined' ? winningBid : existing.winningBid,
        bidStatus: bidStatus || existing.bidStatus || 'PENDING',
        status: status || existing.status,
        notes: notes || existing.notes,
        recommendedMaxBid: computeRecommendedMaxBid(merged),
        estimatedValue: typeof estimatedValue !== 'undefined' ? estimatedValue : existing.estimatedValue,
        transportEstimate: typeof transportEstimate !== 'undefined' ? transportEstimate : existing.transportEstimate,
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/acquire', async (req, res, next) => {
  try {
    const existing = await prisma.auctionVehicle.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!existing) return res.status(404).json({ message: 'Auction vehicle not found' });

    const { winningBid, status, notes, auctionDate } = req.body;
    const row = await prisma.auctionVehicle.update({
      where: { id: req.params.id },
      data: {
        winningBid: typeof winningBid !== 'undefined' ? winningBid : existing.winningBid,
        status: status || 'ACQUIRED',
        notes: notes || existing.notes,
        auctionDate: auctionDate ? new Date(auctionDate) : existing.auctionDate,
      },
    });
    res.status(200).json(row);
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
        auctionDate: req.body.auctionDate ? new Date(req.body.auctionDate) : existing.auctionDate,
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
