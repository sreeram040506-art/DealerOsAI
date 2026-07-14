// Cache buster: database wiped, clearing in-memory server cache on next boot
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars before importing app / Prisma
dotenv.config({ path: path.join(__dirname, '.env') });

import app from './src/app.js';
import cron from 'node-cron';
import { train } from './scripts/trainDemandModel.mjs';
import { runSwapCampaign } from './src/services/interDealershipCampaign.js';
import { ensureSuperAdmin } from './src/seeds/ensureSuperAdmin.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

  // Ensure super admin accounts exist on every boot
  await ensureSuperAdmin();
  
  // Self-ping logic to prevent Render sleep (every 5 minutes)
  const renderUrl = process.env.VITE_API_ORIGIN;
  if (renderUrl) {
    console.log(`[Self-Ping] Starting self-ping for ${renderUrl}/api/ping every 5 minutes`);
    setInterval(async () => {
      try {
        const response = await fetch(`${renderUrl}/api/ping`);
        const text = await response.text();
        console.log(`[Self-Ping] Status: ${response.status}, Response: ${text}`);
      } catch (error) {
        console.error(`[Self-Ping] Error: ${error.message}`);
      }
    }, 300000); // 5 minutes
  } else {
    console.warn('[Self-Ping] VITE_API_ORIGIN not set, self-ping disabled');
  }

  // Schedule weekly retraining of demand model (Sunday 03:00 UTC)
  try {
    cron.schedule('0 3 * * 0', async () => {
      console.log('[Predictor] Weekly retrain starting');
      try {
        const model = await train({ lookbackDays: Number(process.env.PREDICTOR_LOOKBACK_DAYS) || 365 });
        console.log(`[Predictor] Retrain completed. Items: ${model.itemCount}`);
      } catch (e) {
        console.error('[Predictor] Retrain failed', e);
      }
    }, { timezone: process.env.PREDICTOR_CRON_TZ || 'UTC' });

    cron.schedule(process.env.SWAP_CAMPAIGN_CRON || '0 9 * * 1', async () => {
      console.log('[Predictor] Inter-dealership swap campaign starting');
      try {
        const campaignResult = await runSwapCampaign();
        console.log('[Predictor] Swap campaign result', campaignResult);
      } catch (e) {
        console.error('[Predictor] Swap campaign failed', e);
      }
    }, { timezone: process.env.SWAP_CAMPAIGN_CRON_TZ || process.env.PREDICTOR_CRON_TZ || 'UTC' });

    // Run an initial training on server start (non-blocking)
    (async () => {
      try {
        console.log('[Predictor] Running initial model training...');
        const model = await train({ lookbackDays: Number(process.env.PREDICTOR_LOOKBACK_DAYS) || 365 });
        console.log(`[Predictor] Initial training completed: ${model.itemCount} items`);
      } catch (e) {
        console.error('[Predictor] Initial training failed', e);
      }
    })();
  } catch (e) {
    console.error('[Predictor] Failed to schedule retrain job', e);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
