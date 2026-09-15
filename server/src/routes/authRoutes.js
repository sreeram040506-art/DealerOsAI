import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { JWT_SECRET } from '../config/jwt.js';

const router = express.Router();

// The general /api/ limiter (500 req/15min) is far too loose to slow down password guessing
// on its own. Scoped tightly to this one route so it doesn't throttle anything else, and only
// failed attempts count — a legitimate user retyping a password correctly on attempt 3 never
// gets close to the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 failed attempts per IP per window
  message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
  skipSuccessfulRequests: true,
});

router.post('/login', loginLimiter, async (req, res, next) => {
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
