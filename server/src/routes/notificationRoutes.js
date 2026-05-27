import express from 'express';
import prisma from '../db/prisma.js';
import { dispatchNotification } from '../services/notificationDispatcher.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.notification.findMany({
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
    const { type, title, message, severity, isRead, dueAt } = req.body;
    if (!type || !title || !message) return res.status(400).json({ message: 'type, title, and message are required' });
    const row = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        severity: severity || 'MEDIUM',
        isRead: Boolean(isRead),
        dueAt: dueAt ? new Date(dueAt) : null,
        dealershipId: req.dealershipId,
      },
    });

    // Fire notifications in the background
    const dealership = await prisma.dealership.findUnique({
      where: { id: req.dealershipId }
    });

    dispatchNotification({
      title,
      message,
      severity: severity || 'MEDIUM',
      type,
      recipientEmail: dealership?.email || 'manager@dealeros.ai',
      recipientPhone: dealership?.phone || null
    }).catch(err => console.error('Error dispatching notifications:', err));

    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.notification.findFirst({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!existing) return res.status(404).json({ message: 'Notification not found' });
    const { dueAt, ...rest } = req.body;
    const row = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(typeof dueAt !== 'undefined' ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.notification.deleteMany({ where: { id: req.params.id, dealershipId: req.dealershipId } });
    if (!result.count) return res.status(404).json({ message: 'Notification not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
