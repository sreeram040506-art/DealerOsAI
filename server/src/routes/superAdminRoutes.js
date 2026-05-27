import express from 'express';
import prisma from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, authorizeSuperAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes here require Super Admin privileges
router.use(authenticateToken, authorizeSuperAdmin);

// 1. Get Platform Stats
router.get('/stats', async (req, res, next) => {
  try {
    const [dealershipsCount, usersCount, vehiclesCount] = await Promise.all([
      prisma.dealership.count(),
      prisma.user.count(),
      prisma.vehicle.count()
    ]);

    res.json({
      dealershipsCount,
      usersCount,
      vehiclesCount
    });
  } catch (err) {
    next(err);
  }
});

// 1.1 Get Platform Analytics (Growth Trends)
router.get('/analytics', async (req, res, next) => {
  try {
    const dealerships = await prisma.dealership.findMany({
      select: { createdAt: true, isActive: true }
    });

    // Group dealerships by month
    const growth = dealerships.reduce((acc, d) => {
      const month = d.createdAt.toLocaleString('default', { month: 'short' });
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.entries(growth).map(([name, value]) => ({ name, value }));

    const statusBreakdown = [
      { name: 'Active', value: dealerships.filter(d => d.isActive).length },
      { name: 'Suspended', value: dealerships.filter(d => !d.isActive).length }
    ];

    res.json({
      growth: chartData,
      statusBreakdown
    });
  } catch (err) {
    next(err);
  }
});

// 2. List all Dealerships
router.get('/dealerships', async (req, res, next) => {
  try {
    const dealerships = await prisma.dealership.findMany({
      include: {
        _count: {
          select: { users: true, vehicles: true, sales: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(dealerships);
  } catch (err) {
    next(err);
  }
});

// 3. Create a new Dealership + Admin User
router.post('/dealerships', async (req, res, next) => {
  const { dealershipName, adminName, email, password } = req.body;

  if (!dealershipName || !adminName || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const dealership = await tx.dealership.create({
        data: { name: dealershipName, slug: dealershipName.toLowerCase().replace(/\s+/g, '-') }
      });

      const user = await tx.user.create({
        data: {
          name: adminName,
          email,
          password: hashedPassword,
          role: 'ADMIN',
          dealershipId: dealership.id
        }
      });

      return { dealership, user };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// 4. Toggle Dealership Status
router.patch('/dealerships/:id/toggle', async (req, res, next) => {
  try {
    const dealership = await prisma.dealership.findUnique({ where: { id: req.params.id } });
    if (!dealership) return res.status(404).json({ message: 'Dealership not found' });

    const updated = await prisma.dealership.update({
      where: { id: req.params.id },
      data: { isActive: !dealership.isActive }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
