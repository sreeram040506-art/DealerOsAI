import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { validate, advertisingSchema } from '../utils/validators.js';
import { adsCache } from '../utils/cache.js';

const router = express.Router();

// Only Admin can see/manage advertising spend
router.use(authorizeAdmin);

router.get('/', async (req, res, next) => {
  try {
    const cacheKey = `ads-list:${req.dealershipId}`;
    const cached = adsCache.get(cacheKey);
    if (cached) return res.json(cached);

    const ads = await prisma.advertisingExpense.findMany({ 
      where: { dealershipId: req.dealershipId },
      orderBy: { startDate: 'desc' } 
    });
    adsCache.set(cacheKey, ads);
    res.json(ads);
  } catch (err) {
    next(err);
  }
});

router.post('/generate-copy', async (req, res, next) => {
  try {
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ message: 'vehicleId is required' });

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId, dealershipId: req.dealershipId }
    });

    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey || openaiApiKey === 'YOUR_OPENAI_API_KEY_HERE') {
      return res.status(503).json({ message: 'OpenAI API key not configured' });
    }

    const prompt = `Write a compelling and engaging Facebook/Google ad for a ${vehicle.year} ${vehicle.make} ${vehicle.model} in ${vehicle.color} with ${vehicle.mileage} miles. Highlight its features and create urgency for the buyer. Keep it concise.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert automotive marketing copywriter." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 200,
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      console.error("OpenAI API Error:", data.error);
      return res.status(500).json({ message: 'AI provider error' });
    }

    const adCopy = data?.choices?.[0]?.message?.content;
    res.json({ adCopy });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(advertisingSchema), async (req, res, next) => {
  try {
    const ad = await prisma.advertisingExpense.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        dealershipId: req.dealershipId
      }
    });
    const cacheKey = `ads-list:${req.dealershipId}`;
    adsCache.delete(cacheKey);
    res.status(201).json(ad);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(advertisingSchema), async (req, res, next) => {
  try {
    const result = await prisma.advertisingExpense.updateMany({
      where: { id: req.params.id, dealershipId: req.dealershipId },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
      }
    });

    if (result.count === 0) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    const ad = await prisma.advertisingExpense.findUnique({ where: { id: req.params.id } });
    const cacheKey = `ads-list:${req.dealershipId}`;
    adsCache.delete(cacheKey);
    res.json(ad);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.advertisingExpense.deleteMany({
      where: { id: req.params.id, dealershipId: req.dealershipId }
    });
    const cacheKey = `ads-list:${req.dealershipId}`;
    adsCache.delete(cacheKey);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
