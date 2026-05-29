import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

function parseDateOnly(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatPercent(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
}

/**
 * GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns attendance records grouped by user plus computed attendance %.
 * Present/Absent inputs are based on stored status.
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'from and to are required (YYYY-MM-DD)' });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setUTCHours(23, 59, 59, 999);

    if (start.getTime() > end.getTime()) {
      return res.status(400).json({ message: 'from date must be on or before to date' });
    }

    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';

    const users = await prisma.user.findMany({
      where: {
        dealershipId: req.dealershipId,
        ...(isAdmin ? {} : { id: req.user.id }),
      },
      select: { id: true, name: true, role: true }
    });

    const records = await prisma.attendanceRecord.findMany({
      where: {
        dealershipId: req.dealershipId,
        date: { gte: start, lte: end }
      },
      select: {
        userId: true,
        date: true,
        status: true
      }
    });

    // Build map: userId -> dateKey -> status
    const byUser = new Map();
    for (const u of users) byUser.set(u.id, new Map());

    for (const r of records) {
      const dateKey = new Date(r.date).toISOString().slice(0, 10);
      const map = byUser.get(r.userId);
      if (!map) continue;
      map.set(dateKey, r.status);
    }

    // Date keys list for the range inclusive
    const days = [];
    const cur = new Date(start);
    for (;;) {
      const key = cur.toISOString().slice(0, 10);
      days.push(key);
      if (key >= end.toISOString().slice(0, 10)) break;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const payload = users.map(u => {
      const map = byUser.get(u.id) || new Map();

      let presentDays = 0;
      let markedDays = 0;

      for (const key of days) {
        const status = map.get(key);
        if (!status) continue; // unmarked
        markedDays += 1;
        if (status === 'PRESENT') presentDays += 1;
      }

      const percent = formatPercent(presentDays, markedDays);

      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        days,
        markedDays,
        presentDays,
        attendancePercent: percent,
        records: days.map(key => ({
          date: key,
          status: map.get(key) || null
        }))
      };
    });

    res.json({ from, to, days, users: payload });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/attendance/mark
 * Body: { date: 'YYYY-MM-DD', status: 'PRESENT'|'ABSENT' }
 * Employees can mark their own attendance for a date.
 */
router.post('/mark', authenticateToken, async (req, res, next) => {
  try {
    const { date, status } = req.body || {};
    const d = parseDateOnly(date);
    if (!d) return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });
    if (!['PRESENT', 'ABSENT'].includes(status)) {
      return res.status(400).json({ message: "status must be 'PRESENT' or 'ABSENT'" });
    }

    const day = new Date(d);
    day.setHours(0, 0, 0, 0);

    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        dealershipId_userId_date: {
          dealershipId: req.dealershipId,
          userId: req.user.id,
          date: day
        }
      },
      select: { id: true, status: true }
    });

    if (existing?.id) {
      return res.status(409).json({ message: 'Attendance already submitted for this date' });
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        dealershipId: req.dealershipId,
        userId: req.user.id,
        date: day,
        status
      },
      select: { id: true, status: true, userId: true, date: true }
    });

    res.json({ message: 'Attendance saved', record });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/attendance/:userId/:date
 * Admin edits any employee attendance after submission.
 */
router.patch('/:userId/:date', authorizeAdmin, async (req, res, next) => {
  try {
    const { userId, date } = req.params;
    const d = parseDateOnly(date);
    if (!d) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });

    const { status } = req.body || {};
    if (!['PRESENT', 'ABSENT'].includes(status)) {
      return res.status(400).json({ message: "status must be 'PRESENT' or 'ABSENT'" });
    }

    const day = new Date(d);
    day.setHours(0, 0, 0, 0);

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, dealershipId: req.dealershipId },
      select: { id: true },
    });

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found in this dealership' });
    }

    const record = await prisma.attendanceRecord.upsert({
      where: {
        dealershipId_userId_date: {
          dealershipId: req.dealershipId,
          userId,
          date: day
        }
      },
      update: { status },
      create: {
        dealershipId: req.dealershipId,
        userId,
        date: day,
        status
      },
      select: { id: true, status: true, userId: true, date: true }
    });

    res.json({ message: 'Attendance updated', record });
  } catch (err) {
    next(err);
  }
});

export default router;
