import express from 'express';
import prisma from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { injectTenant } from '../middlewares/tenantMiddleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Public endpoint to register a new dealership and its first admin
router.post('/register', async (req, res, next) => {
  const { dealershipName, adminName, email, password } = req.body;

  if (!dealershipName || !adminName || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Dealership
      const dealership = await tx.dealership.create({
        data: { name: dealershipName }
      });

      // 2. Create Admin User
      const user = await tx.user.create({
        data: {
          name: adminName,
          email,
          password: hashedPassword,
          role: 'ADMIN',
          dealershipId: dealership.id
        },
        include: { dealership: true }
      });

      return { user, dealership };
    });

    // 3. Generate Token for immediate login
    const token = jwt.sign(
      { 
        id: result.user.id, 
        email: result.user.email, 
        role: result.user.role,
        dealershipId: result.user.dealershipId 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Dealership registered successfully',
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        dealership: result.user.dealership
      }
    });
  } catch (err) {
    console.error('[Dealership Registration Error]', err);
    next(err);
  }
});

// Get current dealership profile
router.get('/profile', authenticateToken, injectTenant, async (req, res, next) => {
  try {
    const dealership = await prisma.dealership.findFirst({
      where: { id: req.dealershipId }
    });
    if (!dealership) return res.status(404).json({ message: 'Dealership not found' });
    res.json(dealership);
  } catch (err) {
    next(err);
  }
});

// Update dealership profile
router.patch('/profile', authenticateToken, injectTenant, authorizeAdmin, async (req, res, next) => {
  const { name, address, phone, email, logoBase64 } = req.body;
  try {
    const dealership = await prisma.dealership.update({
      where: { id: req.dealershipId },
      data: { name, address, phone, email, logoBase64 }
    });
    res.json(dealership);
  } catch (err) {
    next(err);
  }
});

export default router;
