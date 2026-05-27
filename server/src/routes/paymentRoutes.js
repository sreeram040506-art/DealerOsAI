import express from 'express';
import prisma from '../db/prisma.js';
import Stripe from 'stripe';

const router = express.Router();

// Initialize Stripe with secret key from env, fallback to mock if not present
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
});

// Create Stripe Checkout Session for a deal deposit / down payment
router.post('/create-checkout-session', async (req, res, next) => {
  try {
    const { dealId, amount } = req.body;
    if (!dealId || !amount) {
      return res.status(400).json({ message: 'dealId and amount are required' });
    }

    const deal = await prisma.sale.findFirst({
      where: { id: dealId, dealershipId: req.dealershipId },
      include: { vehicle: true },
    });

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    // Dynamic redirect URLs
    const origin = req.headers.origin || 'http://localhost:5173';

    let sessionUrl = '';
    let sessionId = 'mock_session_' + Date.now();

    if (process.env.STRIPE_SECRET_KEY) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Down Payment - ${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`,
                description: `VIN: ${deal.vehicle.vin} | Customer: ${deal.customerName}`,
              },
              unit_amount: Math.round(amount * 100), // In cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${origin}/sales?payment=success&dealId=${dealId}`,
        cancel_url: `${origin}/sales?payment=cancelled`,
        metadata: {
          dealId: deal.id,
          dealershipId: req.dealershipId,
        },
      });
      sessionUrl = session.url;
      sessionId = session.id;
    } else {
      // Mock session for development/testing
      sessionUrl = `${origin}/sales?payment=success&dealId=${dealId}&mock=true`;
    }

    // Update Deal with Stripe Session ID
    await prisma.sale.update({
      where: { id: dealId },
      data: {
        stripeSessionId: sessionId,
        paymentStatus: 'PENDING',
      },
    });

    res.json({ id: sessionId, url: sessionUrl || `${origin}/sales?payment=success&dealId=${dealId}&mock=true` });
  } catch (err) {
    next(err);
  }
});

// Stripe Webhook handler to record successful payments
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      // Direct JSON parsing fallback for mock testing
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const dealId = session.metadata?.dealId;

    if (dealId) {
      try {
        await prisma.sale.update({
          where: { id: dealId },
          data: { paymentStatus: 'PAID' },
        });
        console.log(`Payment confirmed for Deal: ${dealId}`);
      } catch (err) {
        console.error(`Failed to update deal payment status: ${err.message}`);
      }
    }
  }

  res.json({ received: true });
});

export default router;
