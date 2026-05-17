import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
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
import db                    from './db.js';

const app  = express();
const PORT = process.env.PORT || 3002;

process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port already in use — kill the existing process or set a different PORT in .env`);
    process.exit(1);
  }
  throw err;
});

app.use(cors());
app.use(express.json());

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth',         authRouter);
app.use('/api/public/quote', publicQuoteRouter);
app.use('/api/portal',       portalRouter);
app.use('/api/fuel-price',   fuelPriceRouter);
app.use('/api/weather',      weatherRouter);

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
app.use('/api/quotes',        requireAuth, auditMutation('quote'),            quotesRouter);
app.use('/api/jobs',          requireAuth, auditMutation('job'),              jobsRouter);
app.use('/api/templates',     requireAuth, auditMutation('template'),         templatesRouter);
app.use('/api/drivers',       requireAuth, auditMutation('driver'),           driversRouter);
app.use('/api/profitability', requireAuth, auditView('financial_report'),     profitabilityRouter);
app.use('/api/statistics',    requireAuth, auditView('financial_report'),     statisticsRouter);

app.use('/api/invoices',          requireAuth, auditMutation('invoice'), invoicesRouter);
app.use('/api/fleet',             requireAuth, fleetRouter);
app.use('/api/analyse',           requireAuth, analyseRouter);
app.use('/api/distance',          requireAuth, distanceRouter);
app.use('/api/pricing-insights',  requireAuth, pricingInsightsRouter);
app.use('/api/data-privacy',      requireAuth, requireOwner, dataPrivacyRouter);
app.use('/api/customers',         requireAuth, auditMutation('customer_portal'), customersRouter);
app.use('/api/onboarding',        requireAuth, onboardingRouter);

app.use(express.static(join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Åkaren server running on port ${PORT}`);
  // Run immediately at startup, then every 24 h
  setTimeout(runPricingInsightsJob, 5_000);
  setInterval(runPricingInsightsJob, 24 * 60 * 60 * 1_000);
  scheduleDailyBackup();
});
