import express from 'express';
import prisma from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { authorizeAdmin } from '../middlewares/authMiddleware.js';
import { invalidateAccountCache } from '../middlewares/tenantMiddleware.js';

const router = express.Router();
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Roles a dealership admin may hand out. SUPER_ADMIN is platform-level and is only ever
// created by the boot seed — accepting it here let any dealership admin take over the platform.
const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];

// Login looks users up by email alone, so an email must belong to one account platform-wide
// even though the schema's unique index is only per dealership.
async function emailTaken(email, exceptUserId) {
  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  return Boolean(existing && existing.id !== exceptUserId);
}

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
  const normalizedEmail = normalizeEmail(email);
  
  if (!name || !normalizedEmail || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
  }

  try {
    if (await emailTaken(normalizedEmail)) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { 
        name, 
        email: normalizedEmail, 
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
  const normalizedEmail = email ? normalizeEmail(email) : undefined;

  if (role !== undefined && !ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
  }

  try {
    const data = { name, role };
    if (normalizedEmail) {
      if (await emailTaken(normalizedEmail, id)) {
        return res.status(400).json({ message: 'A user with this email already exists' });
      }
      data.email = normalizedEmail;
    }
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id, dealershipId: req.dealershipId },
      data
    });
    invalidateAccountCache();

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
    invalidateAccountCache();
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
