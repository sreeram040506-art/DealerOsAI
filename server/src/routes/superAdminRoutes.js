import express from 'express';
import prisma from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, authorizeSuperAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

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
  const normalizedEmail = normalizeEmail(email);

  if (!dealershipName || !adminName || !normalizedEmail || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
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
          email: normalizedEmail,
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

// 5. Delete a Dealership and everything belonging to it.
//
// This is irreversible and removes real business records, so it is deliberately awkward to
// trigger by accident: the caller must echo back the dealership's exact name. Suspending
// (the toggle below) is the reversible option and is what most cases actually want.
router.delete('/dealerships/:id', async (req, res, next) => {
  try {
    const dealership = await prisma.dealership.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true, vehicles: true, sales: true } } },
    });
    if (!dealership) return res.status(404).json({ message: 'Dealership not found' });

    // A super admin deleting the tenant they are signed in under would destroy their own
    // account mid-request and leave the session pointing at nothing. Read the id off the
    // token rather than req.dealershipId — these routes are mounted without injectTenant,
    // so that property is never populated here.
    if (dealership.id === req.user?.dealershipId) {
      return res.status(400).json({
        message: 'You cannot delete the dealership your own account belongs to. Sign in under a different dealership first.',
      });
    }

    const confirmName = String(req.body?.confirmName || '').trim();
    if (confirmName !== dealership.name) {
      return res.status(400).json({
        message: `To confirm deletion, send the dealership name exactly as "${dealership.name}".`,
      });
    }

    // Children before parents: Purchase/Repair/Sale hold a required relation to Vehicle,
    // and Message/ChannelMember belong to Channel, so deleting out of order fails.
    const order = [
      'customerNote', 'customerDocument', 'repair', 'purchase', 'sale', 'documentRegistry',
      'customer', 'advertisingExpense', 'businessExpense', 'insurancePolicy', 'warrantyContract',
      'auctionVehicle', 'complianceAuditLog', 'complianceRecord', 'marketingLead',
      'marketingListing', 'notification', 'vehicle', 'message', 'channelMember', 'channel',
      'attendanceRecord', 'integrationConnection', 'user',
    ];

    const deleted = {};
    for (const model of order) {
      if (!prisma[model]) continue;
      try {
        const { count } = await prisma[model].deleteMany({ where: { dealershipId: req.params.id } });
        if (count) deleted[model] = count;
      } catch (err) {
        // Not every model is tenant-scoped; skip the ones without a dealershipId column
        // rather than aborting a partially-completed delete.
        console.warn(`[SuperAdmin] Skipped ${model} while deleting dealership: ${err.message.split('\n')[0]}`);
      }
    }

    await prisma.dealership.delete({ where: { id: req.params.id } });

    console.warn(`[SuperAdmin] Dealership "${dealership.name}" (${req.params.id}) deleted by ${req.user?.email}. Removed:`, deleted);
    res.json({
      message: `Dealership "${dealership.name}" and all of its data were deleted.`,
      dealership: { id: dealership.id, name: dealership.name },
      deleted,
    });
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
