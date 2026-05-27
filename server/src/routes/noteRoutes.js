import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get all notes for a vehicle
router.get('/vehicle/:vehicleId', async (req, res, next) => {
  const { vehicleId } = req.params;
  try {
    const notes = await prisma.customerNote.findMany({
      where: { vehicleId, dealershipId: req.dealershipId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

// Add a new note
router.post('/', async (req, res, next) => {
  const { vehicleId, customerName, phone, email, note } = req.body;
  try {
    const customerNote = await prisma.customerNote.create({
      data: {
        vehicleId,
        customerName,
        phone,
        email,
        note,
        dealershipId: req.dealershipId
      }
    });
    res.status(201).json(customerNote);
  } catch (err) {
    next(err);
  }
});

// Delete a note
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    await prisma.customerNote.deleteMany({
      where: { id, dealershipId: req.dealershipId }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
