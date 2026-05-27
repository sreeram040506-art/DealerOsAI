import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import Cache from '../utils/cache.js';

// Separate caches per role to prevent data leakage
const dashboardCache = new Cache(120000); // 2 minutes — dashboard data changes less frequently

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const isStaff = req.user.role === 'STAFF';
    const cacheKey = `dashboard-${req.user.role}-${req.dealershipId}`; // Tenant-specific cache key

    // Check cache first — avoids 5 parallel DB queries on rapid dashboard visits
    const cached = dashboardCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch everything in parallel - EXCLUDING heavy base64 strings
    const [vehiclesResult, salesResult, advertisingResult, expensesResult, teamUsersResult] = await Promise.allSettled([
      prisma.vehicle.findMany({
        where: { dealershipId: req.dealershipId },
        include: { 
          purchase: {
            select: {
              sellerName: true,
              totalPurchaseCost: true,
              purchasePrice: true,
              purchaseDate: true,
            }
          },
          repairs: true,
          sale: {
            select: {
              id: true,
              salePrice: true,
              profit: true,
              saleDate: true,
            }
          } 
        }
      }),
      prisma.sale.findMany({
        where: { dealershipId: req.dealershipId },
        select: {
          id: true,
          salePrice: true,
          profit: true,
          saleDate: true,
          customerName: true,
          vehicle: {
            select: { make: true, model: true }
          }
        },
        orderBy: { saleDate: 'desc' }
      }),
      isAdmin ? prisma.advertisingExpense.findMany({ where: { dealershipId: req.dealershipId } }) : Promise.resolve([]),
      isAdmin ? prisma.businessExpense.findMany({
        where: { dealershipId: req.dealershipId },
        orderBy: { date: 'desc' },
        take: 20
      }) : Promise.resolve([]),
      isAdmin
        ? prisma.user.findMany({
            where: { dealershipId: req.dealershipId },
            select: {
              id: true,
              name: true,
              role: true,
            },
          })
        : Promise.resolve([])
    ]);

    const vehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [];
    const sales = salesResult.status === 'fulfilled' ? salesResult.value : [];
    const advertising = advertisingResult.status === 'fulfilled' ? advertisingResult.value : [];
    const expenses = expensesResult.status === 'fulfilled' ? expensesResult.value : [];
    const teamUsers = teamUsersResult.status === 'fulfilled' ? teamUsersResult.value : [];

    if (vehiclesResult.status === 'rejected') console.error('[dashboard/summary] vehicles query failed', vehiclesResult.reason?.message || vehiclesResult.reason);
    if (salesResult.status === 'rejected') console.error('[dashboard/summary] sales query failed', salesResult.reason?.message || salesResult.reason);
    if (advertisingResult.status === 'rejected') console.error('[dashboard/summary] advertising query failed', advertisingResult.reason?.message || advertisingResult.reason);
    if (expensesResult.status === 'rejected') console.error('[dashboard/summary] expenses query failed', expensesResult.reason?.message || expensesResult.reason);
    if (teamUsersResult.status === 'rejected') console.error('[dashboard/summary] team users query failed', teamUsersResult.reason?.message || teamUsersResult.reason);

    // Build per-user activity counts without Prisma relation _count to avoid engine-level incompatibilities.
    const team = isAdmin
      ? await Promise.allSettled(
          teamUsers.map(async (u) => {
            const [vehiclesAdded, salesMade] = await Promise.all([
              prisma.vehicle.count({ where: { dealershipId: req.dealershipId, createdById: u.id } }),
              prisma.sale.count({ where: { dealershipId: req.dealershipId, createdById: u.id } }),
            ]);
            return {
              ...u,
              _count: { vehiclesAdded, salesMade },
            };
          }),
        ).then((results) =>
          results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => r.value),
        )
      : [];

    // If Staff, mask sensitive financial data in the summary
    const maskedVehicles = isStaff ? vehicles.map(v => ({
      ...v,
      purchase: null,
      repairs: [],
      sale: v.sale ? { id: v.sale.id, saleDate: v.sale.saleDate } : null
    })) : vehicles;

    const maskedSales = isStaff ? sales.map(s => ({
      id: s.id,
      saleDate: s.saleDate,
      vehicle: s.vehicle,
      salePrice: 0,
      profit: 0,
      customerName: 'Customer' // Generic name for staff
    })) : sales;

    const result = {
      vehicles: maskedVehicles,
      sales: maskedSales,
      advertising,
      expenses,
      team
    };

    // Cache the role-specific result
    dashboardCache.set(cacheKey, result);

    res.json(result);
  } catch (err) {
    console.error('[dashboard/summary] error', {
      dealershipId: req.dealershipId,
      role: req.user?.role,
      message: err?.message,
    });
    next(err);
  }
});

export default router;
