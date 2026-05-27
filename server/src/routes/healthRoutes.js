import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { injectTenant } from '../middlewares/tenantMiddleware.js';

const router = express.Router();

router.get('/api-health', authenticateToken, injectTenant, async (req, res) => {
  const result = {
    ok: true,
    timestamp: new Date().toISOString(),
    dealershipId: req.dealershipId,
    checks: {},
  };

  const checks = [
    ['vehicles', () => prisma.vehicle.count({ where: { dealershipId: req.dealershipId } })],
    ['sales', () => prisma.sale.count({ where: { dealershipId: req.dealershipId } })],
    ['registry', () => prisma.documentRegistry.count({ where: { dealershipId: req.dealershipId } })],
    ['insurance', () => prisma.insurancePolicy.count({ where: { dealershipId: req.dealershipId } })],
    ['warranty', () => prisma.warrantyContract.count({ where: { dealershipId: req.dealershipId } })],
  ];

  for (const [name, fn] of checks) {
    try {
      const count = await fn();
      result.checks[name] = { ok: true, count };
    } catch (err) {
      result.ok = false;
      result.checks[name] = { ok: false, error: err?.message || 'unknown error' };
    }
  }

  res.status(result.ok ? 200 : 207).json(result);
});

export default router;
