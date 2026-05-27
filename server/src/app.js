import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

import authRoutes from './routes/authRoutes.js';
import dealershipRoutes from './routes/dealershipRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import repairRoutes from './routes/repairRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import advertisingRoutes from './routes/advertisingRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import registryRoutes from './routes/registryRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import insuranceRoutes from './routes/insuranceRoutes.js';
import warrantyRoutes from './routes/warrantyRoutes.js';
import auctionRoutes from './routes/auctionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';
import aiInsightsRoutes from './routes/aiInsightsRoutes.js';
import complianceRoutes from './routes/complianceRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import marketingRoutes from './routes/marketingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';


const app = express();

// Trust proxy for secure and accurate rate-limiting behind reverse proxies (like Render)
app.set('trust proxy', 1);

// Enable ETags for conditional GET responses — saves bandwidth on repeated requests
app.set('etag', 'strong');

// Set security HTTP headers with custom CSP for PDF blob support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "frame-src": ["'self'", "blob:"],
      "connect-src": ["'self'", "blob:", "data:"],
      "object-src": ["'self'", "blob:", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Enable compression with smart filtering —
// skip compression for already-compressed binary data (PDFs, images)
app.use(compression({
  threshold: 1024,  // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress document download responses (already binary)
    if (req.path.includes('/document')) return false;
    return compression.filter(req, res);
  },
}));

// Logging — use 'tiny' format in dev for less noise
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('tiny'));
} else {
  app.use(morgan('combined'));
}

// Enable CORS with support for multiple local origins and env overrides
const defaultAllowedOrigins = [
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'http://127.0.0.1:8081',
  'http://localhost:8081',
];

const envAllowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

function isSafeLocalDevOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp) return false;
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins to enable access from any device on the network
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Rate limiting to prevent brute-force attacks
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', apiLimiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/ping', (req, res) => {
  res.status(200).send('Server alive');
});

// Health Check
app.get('/', (req, res) => {
  res.json({ message: 'Auto Profit Hub API is running' });
});

import { authenticateToken } from './middlewares/authMiddleware.js';
import { injectTenant } from './middlewares/tenantMiddleware.js';

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/dealerships', dealershipRoutes);

// Protected Business Routes (Auto-inject dealership context)
app.use('/api/vehicles', authenticateToken, injectTenant, vehicleRoutes);
app.use('/api/sales', authenticateToken, injectTenant, saleRoutes);
app.use('/api/repairs', authenticateToken, injectTenant, repairRoutes);
app.use('/api/expenses', authenticateToken, injectTenant, expenseRoutes);
app.use('/api/advertising', authenticateToken, injectTenant, advertisingRoutes);
app.use('/api/registry', authenticateToken, injectTenant, registryRoutes);
app.use('/api/chat', authenticateToken, injectTenant, chatRoutes);
app.use('/api/team', authenticateToken, injectTenant, teamRoutes);
app.use('/api/dashboard', authenticateToken, injectTenant, dashboardRoutes);
app.use('/api/notes', authenticateToken, injectTenant, noteRoutes);
app.use('/api/customers', authenticateToken, injectTenant, customerRoutes);
app.use('/api/insurance', authenticateToken, injectTenant, insuranceRoutes);
app.use('/api/warranty', authenticateToken, injectTenant, warrantyRoutes);
app.use('/api/auctions', authenticateToken, injectTenant, auctionRoutes);
app.use('/api/notifications', authenticateToken, injectTenant, notificationRoutes);
app.use('/api/integrations', authenticateToken, injectTenant, integrationRoutes);
app.use('/api/ai-insights', authenticateToken, injectTenant, aiInsightsRoutes);
app.use('/api/compliance', authenticateToken, injectTenant, complianceRoutes);
app.use('/api', healthRoutes);
app.use('/api/marketing', authenticateToken, injectTenant, marketingRoutes);
app.use('/api/payments', authenticateToken, injectTenant, paymentRoutes);
app.use('/api/super-admin', superAdminRoutes);


// Document routes also need protection and tenant context
// Mount under /api/documents so routes like POST /api/documents/upload-auto work.
app.use('/api/documents', authenticateToken, injectTenant, documentRoutes);

// Custom error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;
