import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAuth } from './middleware/auth.js';
import { createLimiters } from './middleware/rateLimit.js';
import { createAudit } from './lib/audit.js';
import { errorMiddleware, HttpError } from './lib/http.js';
import { createFortnoxService } from './services/fortnox.js';
import { createSmsService } from './services/sms.js';
import { createAiService } from './services/ai.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { customersRouter } from './routes/customers.js';
import { projectsRouter } from './routes/projects.js';
import { vehiclesRouter, driversRouter } from './routes/fleet.js';
import { fortnoxRouter, fortnoxCallbackRouter } from './routes/fortnox.js';
import { intakeRouter } from './routes/intake.js';
import { jobsRouter } from './routes/jobs.js';

const PRIVATE_LAN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * Build the Express app. External services are injectable so tests can mock them:
 * createApp({ config, db, services: { fortnox, sms, ai } }).
 */
export function createApp({ config, db, services = {}, logger = console }) {
  const fortnox = services.fortnox ?? createFortnoxService({ db, config });
  const sms = services.sms ?? createSmsService({ config, logger });
  const ai = services.ai ?? createAiService({ db, config, logger });
  const audit = createAudit(db, logger);
  const auth = createAuth({ db, config });
  const limiters = createLimiters();
  const deps = { db, config, audit, auth, limiters, fortnox, sms, ai, logger };

  const app = express();
  app.disable('x-powered-by');
  // One proxy hop in dev (Vite). Gives rate limiting the real client IP.
  app.set('trust proxy', 'loopback');

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({
    origin(origin, cb) {
      // No Origin header: same-origin navigation, curl, server-to-server.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      if (!config.isProd && PRIVATE_LAN.test(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    exposedHeaders: ['Content-Disposition'],
  }));
  app.use(express.json({ limit: '256kb' }));

  // Public
  app.use('/api/auth', authRouter(deps));
  app.use('/api/fortnox/callback', fortnoxCallbackRouter(deps));

  // Office
  const office = express.Router();
  office.use(auth.requireOffice, limiters.api);
  office.use('/settings', settingsRouter(deps));
  office.use('/customers', customersRouter(deps));
  office.use('/projects', projectsRouter(deps));
  office.use('/vehicles', vehiclesRouter(deps));
  office.use('/drivers', driversRouter(deps));
  office.use('/fortnox', fortnoxRouter(deps));
  office.use('/intake', intakeRouter(deps));
  office.use('/jobs', jobsRouter(deps));
  app.use('/api', office);

  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', 'Hittades inte.')));

  // Built client (single-port mode: `npm run build && npm start`).
  if (existsSync(join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(join(config.clientDist, 'index.html')));
  }

  app.use(errorMiddleware(logger));
  return app;
}
