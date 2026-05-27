import express from 'express';
import prisma from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get all team members and their activity
router.get('/', authorizeAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { dealershipId: req.dealershipId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            vehiclesAdded: true,
            salesMade: true
          }
        },
        vehiclesAdded: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            createdAt: true
          }
        },
        salesMade: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            salePrice: true,
            profit: true,
            createdAt: true,
            vehicle: {
              select: { make: true, model: true }
            }
          }
        }
      }
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
});

// Create a new team member
router.post('/', authorizeAdmin, async (req, res, next) => {
  const { name, email, password, role } = req.body;
  
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { 
        name, 
        email, 
        password: hashedPassword, 
        role,
        dealershipId: req.dealershipId
      }
    });

    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

// Update a team member
router.patch('/:id', authorizeAdmin, async (req, res, next) => {
  const { name, email, password, role } = req.body;
  const { id } = req.params;

  try {
    const data = { name, email, role };
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id, dealershipId: req.dealershipId },
      data
    });

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

// Delete a team member
router.delete('/:id', authorizeAdmin, async (req, res, next) => {
  const { id } = req.params;
  try {
    // Check if user is not deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    await prisma.user.delete({ 
      where: { id, dealershipId: req.dealershipId } 
    });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
