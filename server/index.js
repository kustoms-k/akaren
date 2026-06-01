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
import { requireAuth, requireOwner, requireRole,
         AGARE, TRAFIKLEDARE, EKONOMI, REVISOR, OFFICE_ROLES } from './middleware/auth.js';
import { auditMutation, auditView }     from './middleware/auditLog.js';
import usersRouter from './routes/users.js';
import { runPricingInsightsJob }        from './jobs/pricingInsights.js';
import { scheduleTenderFetch }          from './jobs/tenderFetch.js';
import { scheduleDailyBackup }          from './jobs/backup.js';
import { scheduleMaintenanceAlerts }    from './jobs/maintenanceAlerts.js';
import dataPrivacyRouter                from './routes/dataPrivacy.js';
import portalRouter                     from './routes/portal.js';
import customersRouter                  from './routes/customers.js';
import onboardingRouter                 from './routes/onboarding.js';
import co2Router                        from './routes/co2.js';
import stripeRouter, { handleStripeWebhook } from './routes/stripe.js';
import bankidRouter                     from './routes/bankid.js';
import driverHoursRouter                from './routes/driverHours.js';
import backhaulRouter                   from './routes/backhaul.js';
import upphandlingarRouter              from './routes/upphandlingar.js';
import natverkRouter                   from './routes/natverk.js';
import drivmedelRouter                 from './routes/drivmedel.js';
import underhallRouter                 from './routes/underhall.js';
import demoRouter                      from './routes/demo.js';
import { isDemoSeeded, seedDemoData }  from './seed/demoData.js';
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
  [process.env.APP_URL, 'http://localhost:5173', 'http://localhost:3002',
   ...(process.env.CORS_EXTRA_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  ].filter(Boolean),
);
// Private LAN pattern — allows access from same local network in dev
const isPrivateLan = (origin) =>
  process.env.NODE_ENV !== 'production' &&
  /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);

app.use(cors({
  origin(origin, cb) {
    // Allow no-origin requests (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.has(origin) || isPrivateLan(origin)) return cb(null, true);
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
app.use('/api/auth/bankid',  authLimiter, bankidRouter);
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

// ── User management — agare only ─────────────────────────────────────────────
app.use('/api/users', apiLimiter, requireAuth, requireRole(AGARE), usersRouter);

// Fortnox — callback public; management for agare + ekonomi
app.use('/api/fortnox/callback', fortnoxRouter);
app.use('/api/fortnox', requireAuth, requireRole(AGARE, EKONOMI), fortnoxRouter);

// Audit log — agare + revisor
app.use('/api/audit', requireAuth, requireRole(AGARE, REVISOR), auditRouter);

// Quotes — agare, trafikledare (write); ekonomi, revisor (read enforced inside route)
app.use('/api/quotes',        apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE, EKONOMI, REVISOR), auditMutation('quote'), quotesRouter);

// Jobs — all authenticated (forare sees only their own, enforced in route)
app.use('/api/jobs',          apiLimiter, requireAuth, auditMutation('job'),              jobsRouter);

// Templates — office staff only (not forare/revisor)
app.use('/api/templates',     apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE, EKONOMI), auditMutation('template'), templatesRouter);

// Drivers — agare + trafikledare
app.use('/api/drivers',       apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), auditMutation('driver'), driversRouter);

// Financial reports — not forare
app.use('/api/profitability', apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE, EKONOMI, REVISOR), auditView('financial_report'), profitabilityRouter);
app.use('/api/statistics',    apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE, EKONOMI, REVISOR), auditView('financial_report'), statisticsRouter);

// Invoices — agare, ekonomi, revisor (read-only for revisor enforced via HTTP method in route)
app.use('/api/invoices',          apiLimiter, requireAuth, requireRole(AGARE, EKONOMI, REVISOR), auditMutation('invoice'), invoicesRouter);

// Fleet — agare + trafikledare (ekonomi/revisor cannot edit)
app.use('/api/fleet',             apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), fleetRouter);

// AI analyse — agare + trafikledare only
app.use('/api/analyse',           analyseLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), requireSubscription, analyseRouter);

// Routing & distance — agare + trafikledare
app.use('/api/distance',          apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), distanceRouter);
app.use('/api/route',             apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), routeRouter);
app.use('/api/route-advisory',    apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), routeAdvisoryRouter);

// Pricing insights — agare + trafikledare + ekonomi
app.use('/api/pricing-insights',  apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE, EKONOMI), requireSubscription, pricingInsightsRouter);

// Data privacy — agare only
app.use('/api/data-privacy',      apiLimiter, requireAuth, requireRole(AGARE), dataPrivacyRouter);

// Customer portals — agare + trafikledare
app.use('/api/customers',         apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), auditMutation('customer_portal'), customersRouter);

// Onboarding — all office staff
app.use('/api/onboarding',        apiLimiter, requireAuth, requireRole(...OFFICE_ROLES), onboardingRouter);

// CO2 — all office staff
app.use('/api/co2',               apiLimiter, requireAuth, requireRole(...OFFICE_ROLES), co2Router);

// Driver hours (EU 561) — agare + trafikledare
app.use('/api/driver-hours',      apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), driverHoursRouter);

// Backhaul optimisation — agare + trafikledare
app.use('/api/backhaul',          apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), backhaulRouter);

// Upphandlingar — agare + trafikledare
app.use('/api/upphandlingar',     apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), upphandlingarRouter);

// Nätverk (subcontractor overflow) — agare + trafikledare
app.use('/api/natverk',           apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), natverkRouter);

// Drivmedel (fuel card reconciliation) — agare + trafikledare
app.use('/api/drivmedel',         apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), drivmedelRouter);
app.use('/api/underhall',         apiLimiter, requireAuth, requireRole(AGARE, TRAFIKLEDARE), underhallRouter);

// Demo data — agare only
app.use('/api/demo',              apiLimiter, requireAuth, requireRole(AGARE), demoRouter);

// Billing — agare only
app.use('/api/stripe',            apiLimiter, requireAuth, requireRole(AGARE), stripeRouter);

app.use(express.static(join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (!isDemoSeeded()) {
    console.log('[demo] Empty database — auto-seeding 2026 Stockholm demo data...');
    try {
      const r = seedDemoData();
      console.log(`[demo] Auto-seeded ${r.seeded} rows.`);
    } catch (e) {
      console.error('[demo] Auto-seed error:', e.message);
    }
  }
})

setTimeout(runPricingInsightsJob, 5_000);
setInterval(runPricingInsightsJob, 24 * 60 * 60 * 1_000);
scheduleDailyBackup();
scheduleTenderFetch();
scheduleMaintenanceAlerts();
