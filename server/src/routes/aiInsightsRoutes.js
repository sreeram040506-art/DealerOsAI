import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [vehicles, sales] = await Promise.all([
      prisma.vehicle.findMany({ where: { dealershipId: req.dealershipId } }),
      prisma.sale.findMany({
        where: { dealershipId: req.dealershipId },
        include: { vehicle: { select: { make: true } } },
      }),
    ]);

    const available = vehicles.filter((v) => v.status !== 'Sold');
    const sold = sales.length;
    const avgDaysOnLot = available.length
      ? Math.round(available.reduce((sum, v) => sum + (v.daysInInventory || 0), 0) / available.length)
      : 0;

    const makeCounts = new Map();
    for (const sale of sales) {
      const make = sale?.vehicle?.make || null;
      if (!make) continue;
      makeCounts.set(make, (makeCounts.get(make) || 0) + 1);
    }
    const bestMake = [...makeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    const totalRevenue = sales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
    const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const marginPct = totalRevenue ? Number(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0;

    const insights = [];
    if (bestMake) {
      insights.push(`${bestMake[0]} inventory is your top seller with ${bestMake[1]} units sold.`);
    }
    insights.push(`${available.length} active vehicles with average ${avgDaysOnLot} days on lot.`);
    insights.push(`Current realized margin is ${marginPct}% across closed deals.`);

    res.json({
      summary: {
        activeInventory: available.length,
        soldUnits: sold,
        avgDaysOnLot,
        revenue: totalRevenue,
        profit: totalProfit,
        marginPct,
      },
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
