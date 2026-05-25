// Railway deployment - Node version check
console.log('Starting server, Node:', process.version, 'PORT:', process.env.PORT)

console.log('=== ÅKAREN SERVER STARTING ===')
console.log('Node version:', process.version)
console.log('PORT:', process.env.PORT)
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('DB_PATH:', process.env.DB_PATH)

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message)
  console.error(err.stack)
})

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
})

import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

import authRouter            from './routes/auth.js';
import fleetRouter           from './routes/fleet.js';
import analyseRouter         from './routes/analyse.js';
import quotesRouter          from './routes/quotes.js';
import jobsRouter            from './routes/jobs.js';
import fuelPriceRouter       from './routes/fuelPrice.js';
import publicQuoteRouter     from './routes/publicQuote.js';
import profitabilityRouter   from './routes/profitability.js';
import driversRouter         from './routes/drivers.js';
import statisticsRouter      from './routes/statistics.js';
import templatesRouter       from './routes/templates.js';
import weatherRouter         from './routes/weather.js';
import roadAlertsRouter      from './routes/roadAlerts.js';
import routeAdvisoryRouter   from './routes/routeAdvisory.js';
import routeRouter           from './routes/route.js';
import distanceRouter        from './routes/distance.js';
import auditRouter           from './routes/audit.js';
import fortnoxRouter         from './routes/fortnox.js';
import invoicesRouter        from './routes/invoices.js';
import pricingInsightsRouter from './routes/pricingInsights.js';
import { requireAuth, requireOwner }    from './middleware/auth.js';
import { auditMutation, auditView }     from './middleware/auditLog.js';
import { runPricingInsightsJob }        from './jobs/pricingInsights.js';
import { scheduleDailyBackup }          from './jobs/backup.js';
import dataPrivacyRouter                from './routes/dataPrivacy.js';
import portalRouter                     from './routes/portal.js';
import customersRouter                  from './routes/customers.js';
import onboardingRouter                 from './routes/onboarding.js';
import co2Router                        from './routes/co2.js';
import stripeRouter, { handleStripeWebhook } from './routes/stripe.js';
import { authLimiter, analyseLimiter, apiLimiter } from './middleware/rateLimit.js';
import { requireSubscription } from './middleware/requireSubscription.js';
import db from './db.js';

// ── Startup security checks ───────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 32) {
  console.error('[SECURITY] JWT_SECRET is missing or too short (need ≥32 chars). Server will not start in production.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
if (JWT_SECRET === 'dev-secret-change-in-production') {
  console.warn('[SECURITY] Warning: default dev JWT_SECRET detected — set a real secret before deploying.');
}

const app  = express();
const PORT = process.env.PORT || 3002;

// ── Health check (first route — Railway needs this) ───────────────────────────
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ── Helmet — security headers ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // disabled — SPA handles its own assets
  crossOriginEmbedderPolicy: false,
}));

// ── CORS — whitelist only known origins ───────────────────────────────────────
const allowedOrigins = new Set(
  [process.env.APP_URL, 'http://localhost:5173', 'http://localhost:3002'].filter(Boolean),
);
app.use(cors({
  origin(origin, cb) {
    // Allow no-origin requests (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Stripe webhook needs raw body — must be before express.json() ─────────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// ── Body parsing — cap at 512 KB to prevent payload attacks ──────────────────
app.use(express.json({ limit: '512kb' }));

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.use('/api/auth',         authLimiter, authRouter);
app.use('/api/public/quote', publicQuoteRouter);
app.use('/api/portal',       portalRouter);
app.use('/api/fuel-price',   fuelPriceRouter);
app.use('/api/weather',      weatherRouter);
app.use('/api/road-alerts',  roadAlertsRouter);

// ── Protected routes (require JWT) ───────────────────────────────────────────
app.use('/api/company', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.companyId);
  if (!row) return res.status(404).json({ error: 'Company not found' });
  const { fortnox_token, ...safe } = row;
  res.json(safe);
});

// Fortnox integration — callback is public; all other routes are owner-only
app.use('/api/fortnox/callback', fortnoxRouter);
app.use('/api/fortnox', requireAuth, requireOwner, fortnoxRouter);

// Audit log — owner-only
app.use('/api/audit', requireAuth, requireOwner, auditRouter);

// Mutations auto-logged; financial reads logged as 'view'
app.use('/api/quotes',        apiLimiter, requireAuth, auditMutation('quote'),            quotesRouter);
app.use('/api/jobs',          apiLimiter, requireAuth, auditMutation('job'),              jobsRouter);
app.use('/api/templates',     apiLimiter, requireAuth, auditMutation('template'),         templatesRouter);
app.use('/api/drivers',       apiLimiter, requireAuth, auditMutation('driver'),           driversRouter);
app.use('/api/profitability', apiLimiter, requireAuth, auditView('financial_report'),     profitabilityRouter);
app.use('/api/statistics',    apiLimiter, requireAuth, auditView('financial_report'),     statisticsRouter);

app.use('/api/invoices',          apiLimiter,     requireAuth, auditMutation('invoice'), invoicesRouter);
app.use('/api/fleet',             apiLimiter,     requireAuth, fleetRouter);
app.use('/api/analyse',           analyseLimiter, requireAuth, requireSubscription, analyseRouter);
app.use('/api/distance',          apiLimiter,     requireAuth, distanceRouter);
app.use('/api/route',             apiLimiter,     requireAuth, routeRouter);
app.use('/api/route-advisory',    apiLimiter,     requireAuth, routeAdvisoryRouter);
app.use('/api/pricing-insights',  apiLimiter,     requireAuth, requireSubscription, pricingInsightsRouter);
app.use('/api/data-privacy',      apiLimiter,     requireAuth, requireOwner, dataPrivacyRouter);
app.use('/api/customers',         apiLimiter,     requireAuth, auditMutation('customer_portal'), customersRouter);
app.use('/api/onboarding',        apiLimiter,     requireAuth, onboardingRouter);
app.use('/api/co2',               apiLimiter,     requireAuth, co2Router);
app.use('/api/stripe',            apiLimiter,     requireAuth, requireOwner, stripeRouter);

app.use(express.static(join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})

setTimeout(runPricingInsightsJob, 5_000);
setInterval(runPricingInsightsJob, 24 * 60 * 60 * 1_000);
scheduleDailyBackup();
