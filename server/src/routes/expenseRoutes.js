import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, expenseSchema } from '../utils/validators.js';
import { expenseCache } from '../utils/cache.js';

const router = express.Router();

// Only Admin can manage/view business expenses
router.use(authorizeAdmin);

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = `expense-list:${req.dealershipId}`;
    const cached = expenseCache.get(cacheKey);
    if (cached) return res.json(cached);

    const expenses = await prisma.businessExpense.findMany({ 
      where: { dealershipId: req.dealershipId },
      orderBy: { date: 'desc' } 
    });
    expenseCache.set(cacheKey, expenses);
    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(expenseSchema), async (req, res, next) => {
  try {
    const expense = await prisma.businessExpense.create({
      data: { 
        ...req.body, 
        date: new Date(req.body.date),
        dealershipId: req.dealershipId
      }
    });
    const cacheKey = `expense-list:${req.dealershipId}`;
    expenseCache.delete(cacheKey);
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(expenseSchema), async (req, res, next) => {
  try {
    const result = await prisma.businessExpense.updateMany({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      data: { ...req.body, date: new Date(req.body.date) }
    });

    if (result.count === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const expense = await prisma.businessExpense.findUnique({ where: { id: req.params.id } });
    const cacheKey = `expense-list:${req.dealershipId}`;
    expenseCache.delete(cacheKey);
    res.json(expense);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.businessExpense.deleteMany({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    const cacheKey = `expense-list:${req.dealershipId}`;
    expenseCache.delete(cacheKey);
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
