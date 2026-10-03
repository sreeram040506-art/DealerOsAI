import express from 'express';
import prisma from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, authorizeAdmin } from '../middlewares/authMiddleware.js';
import { injectTenant } from '../middlewares/tenantMiddleware.js';
import { JWT_SECRET } from '../config/jwt.js';
import {
  getDealershipSecrets,
  getDealershipSettings,
  getSettingsForDisplay,
  resolveOpenAiKey,
  updateDealershipSettings,
} from '../services/dealershipSettings.js';
import { dispatchNotification } from '../services/notificationDispatcher.js';

const router = express.Router();
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Dealership.slug is a required, unique field, but this endpoint never generated one before
// calling create() — every self-service registration failed outright with a Prisma
// "Argument `slug` is missing" error. Slugified from the name, with a short random suffix on
// a collision (two dealerships choosing the same or very similar name isn't rare) rather than
// failing registration outright over a cosmetic URL fragment nothing user-facing reads yet.
function slugifyDealershipName(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'dealership';
}

async function generateUniqueDealershipSlug(name) {
  const base = slugifyDealershipName(name);
  let candidate = base;
  let attempt = 0;
  while (await prisma.dealership.findUnique({ where: { slug: candidate } })) {
    attempt += 1;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (attempt > 5) break; // extremely unlikely; avoid looping forever
  }
  return candidate;
}

// Public endpoint to register a new dealership and its first admin
router.post('/register', async (req, res, next) => {
  const { dealershipName, adminName, email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!dealershipName || !adminName || !normalizedEmail || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if email already exists
    const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const slug = await generateUniqueDealershipSlug(dealershipName);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Dealership
      const dealership = await tx.dealership.create({
        data: { name: dealershipName, slug }
      });

      // 2. Create Admin User
      const user = await tx.user.create({
        data: {
          name: adminName,
          email: normalizedEmail,
          password: hashedPassword,
          role: 'ADMIN',
          dealershipId: dealership.id
        },
        include: { dealership: true }
      });

      return { user, dealership };
    });

    // 3. Generate Token for immediate login
    const token = jwt.sign(
      { 
        id: result.user.id, 
        email: result.user.email, 
        role: result.user.role,
        dealershipId: result.user.dealershipId 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Dealership registered successfully',
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        dealership: result.user.dealership
      }
    });
  } catch (err) {
    console.error('[Dealership Registration Error]', err);
    next(err);
  }
});

// Get current dealership profile
router.get('/profile', authenticateToken, injectTenant, async (req, res, next) => {
  try {
    const dealership = await prisma.dealership.findFirst({
      where: { id: req.dealershipId }
    });
    if (!dealership) return res.status(404).json({ message: 'Dealership not found' });
    res.json(dealership);
  } catch (err) {
    next(err);
  }
});

// Update dealership profile
router.patch('/profile', authenticateToken, injectTenant, authorizeAdmin, async (req, res, next) => {
  const { name, address, phone, email, logoBase64 } = req.body;
  try {
    const dealership = await prisma.dealership.update({
      where: { id: req.dealershipId },
      data: { name, address, phone, email, logoBase64 }
    });
    res.json(dealership);
  } catch (err) {
    next(err);
  }
});

// ── Per-dealership settings (admin only) ─────────────────────────────────────────────────

router.get('/settings', authenticateToken, injectTenant, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(await getSettingsForDisplay(req.dealershipId));
  } catch (err) {
    next(err);
  }
});

router.patch('/settings', authenticateToken, injectTenant, authorizeAdmin, async (req, res, next) => {
  try {
    const { settings, credentials } = req.body || {};
    res.json(await updateDealershipSettings(req.dealershipId, { settings, credentials }, req.user.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
    next(err);
  }
});

// Sends a real test through one integration using this dealership's saved settings.
router.post('/settings/test/:integration', authenticateToken, injectTenant, authorizeAdmin, async (req, res, next) => {
  try {
    const { integration } = req.params;
    const title = 'Test notification';
    const message = 'This is a test from your dealership settings. If you received it, this channel works.';

    if (['email', 'sms', 'slack'].includes(integration)) {
      const results = await dispatchNotification({ dealershipId: req.dealershipId, title, message, severity: 'LOW', type: 'TEST', only: integration });
      const outcome = results[integration];
      return res.status(outcome === 'sent' ? 200 : 400).json({ ok: outcome === 'sent', message: outcome === 'sent' ? 'Test sent.' : `Not sent: ${outcome}.` });
    }

    if (integration === 'facebook') {
      const [settings, secrets] = await Promise.all([getDealershipSettings(req.dealershipId), getDealershipSecrets(req.dealershipId)]);
      const pageId = settings.marketing.facebookPageId;
      if (!pageId || !secrets.facebookAccessToken) {
        return res.status(400).json({ ok: false, message: 'Add the Facebook Page ID and access token first.' });
      }
      const response = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=name`, {
        headers: { Authorization: `Bearer ${secrets.facebookAccessToken}` },
      });
      const body = await response.json().catch(() => ({}));
      return response.ok
        ? res.json({ ok: true, message: `Connected to the Facebook Page "${body.name}".` })
        : res.status(400).json({ ok: false, message: `Facebook rejected the credentials: ${body?.error?.message || response.status}` });
    }

    if (integration === 'openai') {
      const key = await resolveOpenAiKey(req.dealershipId);
      if (!key) return res.status(400).json({ ok: false, message: 'AI is turned off or no key is available.' });
      const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      return response.ok
        ? res.json({ ok: true, message: 'OpenAI accepted the key.' })
        : res.status(400).json({ ok: false, message: `OpenAI rejected the key (HTTP ${response.status}).` });
    }

    res.status(404).json({ message: 'Unknown integration' });
  } catch (err) {
    next(err);
  }
});

export default router;
