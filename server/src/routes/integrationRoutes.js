import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.integrationConnection.findMany({
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
    const { name, provider, status, webhookUrl, lastSyncAt, errorMessage, metadata } = req.body;
    if (!name || !provider) return res.status(400).json({ message: 'name and provider are required' });
    const row = await prisma.integrationConnection.create({
      data: {
        name,
        provider,
        status: status || 'DISCONNECTED',
        webhookUrl: webhookUrl || null,
        lastSyncAt: lastSyncAt ? new Date(lastSyncAt) : null,
        errorMessage: errorMessage || null,
        metadata: metadata || null,
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
    const existing = await prisma.integrationConnection.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!existing) return res.status(404).json({ message: 'Integration not found' });
    const { lastSyncAt, ...rest } = req.body;
    const row = await prisma.integrationConnection.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(typeof lastSyncAt !== 'undefined' ? { lastSyncAt: lastSyncAt ? new Date(lastSyncAt) : null } : {}),
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.integrationConnection.deleteMany({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!result.count) return res.status(404).json({ message: 'Integration not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
