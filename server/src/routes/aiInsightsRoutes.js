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

router.post('/ask', async (req, res, next) => {
  try {
    const question = String(req.body.question || '').trim();
    if (!question) {
      return res.status(400).json({ message: 'Question is required' });
    }

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

    const normalized = question.toLowerCase();
    let answer = 'I can help with inventory, sales, and margin insights. Ask something like "Which vehicle make is selling best?"';

    if (/inventory|active vehicles|stock|vehicles on lot|on lot/.test(normalized)) {
      answer = `You currently have ${available.length} active vehicles in stock and an average of ${avgDaysOnLot} days on lot.`;
    } else if (/sold|sales|units sold|closed deals/.test(normalized)) {
      answer = `You have closed ${sold} deals so far. Total realized revenue is $${totalRevenue.toLocaleString()} and profit is $${totalProfit.toLocaleString()}.`;
    } else if (/margin|profit|revenue|profit margin/.test(normalized)) {
      answer = `Your current realized margin is ${marginPct}% across closed deals, with $${totalProfit.toLocaleString()} profit on $${totalRevenue.toLocaleString()} revenue.`;
    } else if (/best seller|top seller|top make|selling best/.test(normalized) && bestMake) {
      answer = `Your top-selling make is ${bestMake[0]} with ${bestMake[1]} units sold.`;
    } else if (/days on lot|turnover|velocity/.test(normalized)) {
      answer = `Active inventory is turning with an average of ${avgDaysOnLot} days on lot.`;
    } else if (/make|brand/.test(normalized) && bestMake) {
      answer = `Based on sales, ${bestMake[0]} is your strongest selling make with ${bestMake[1]} units sold.`;
    }

    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

export default router;
