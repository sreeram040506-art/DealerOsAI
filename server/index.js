// Cache buster: database wiped, clearing in-memory server cache on next boot
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  
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
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
