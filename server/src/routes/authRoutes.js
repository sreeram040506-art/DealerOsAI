import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  
  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findFirst({ 
      where: { email: normalizedEmail },
      include: { dealership: true }
    });
    
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ message: 'Invalid credentials' });

    // Block login if dealership is suspended (Super Admin always has access)
    if (user.role !== 'SUPER_ADMIN' && user.dealership && !user.dealership.isActive) {
      return res.status(403).json({ 
        message: 'Your dealership account has been suspended. Please contact the platform administrator for support.' 
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        dealershipId: user.dealershipId 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        dealership: user.dealership
      } 
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.id },
      include: { dealership: true }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Revoke access if dealership is suspended
    if (user.role !== 'SUPER_ADMIN' && user.dealership && !user.dealership.isActive) {
      return res.status(403).json({ message: 'Account suspended' });
    }
    res.json({ 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      role: user.role,
      dealership: user.dealership
    });
  } catch (err) {
    next(err);
  }
});

export default router;
