import { z } from 'zod';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const url = z.preprocess(emptyToUndefined, z.url());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

const schema = z.object({
  NODE_ENV:  z.enum(['development', 'test', 'production']).default('development'),
  HOST:      z.preprocess(emptyToUndefined, z.string().default('0.0.0.0')),
  PORT:      z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3002)),
  DATA_DIR:  z.preprocess(emptyToUndefined, z.string().default('./data')),
  BACKUP_DIR: optionalString,
  CLIENT_DIST: z.preprocess(emptyToUndefined, z.string().default('../client/dist')),

  APP_URL:         url,
  PUBLIC_BASE_URL: url,
  CORS_ORIGINS:    optionalString,

  JWT_SECRET:     z.string({ error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string({ error: 'ENCRYPTION_KEY is required' }).regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters'),
  DRIVER_LINK_MAX_DAYS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(31).default(7)),

  ANTHROPIC_API_KEY:  optionalString,
  ANTHROPIC_MODEL:    z.preprocess(emptyToUndefined, z.string().default('claude-opus-5')),
  ANTHROPIC_BASE_URL: optionalUrl,
  // Hard monthly cap on estimated AI spend per company (USD). 0 disables AI calls.
  AI_MONTHLY_BUDGET_USD: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(10000).default(30)),
  // Local demos only: canned order extractions for the built-in sample orders when no API key is set,
  // and a login button that needs no email or password.
  DEMO_MODE: z.preprocess(emptyToUndefined, z.enum(['0', '1']).default('0')),
  // Hosted demo instance only (with DEMO_MODE=1): wipe and reseed the demo data every night, so the dates stay current
  // and whatever prospects changed is gone the next morning. Starts with seeded data when the database is empty.
  DEMO_AUTO_RESET: z.preprocess(emptyToUndefined, z.enum(['0', '1']).default('0')),
  // Which proxies to trust for the client IP (rate limits, audit log). 'loopback' for the Vite dev proxy;
  // a hop count such as 1 behind a reverse proxy in another container (deploy/compose.yaml).
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.string().regex(/^(loopback|\d{1,2})$/, "TRUST_PROXY must be 'loopback' or a hop count").default('loopback')),

  ELKS_USERNAME: optionalString,
  ELKS_PASSWORD: optionalString,
  ELKS_SENDER:   z.preprocess(emptyToUndefined, z.string()
    .regex(/^[A-Za-z][A-Za-z0-9]{1,10}$/, 'ELKS_SENDER must be 2–11 ASCII letters/digits and start with a letter')
    .default('Akaren')),
  ELKS_API_BASE: z.preprocess(emptyToUndefined, z.url().default('https://api.46elks.com/a1')),

  // SMTP for order confirmation emails. Without SMTP_HOST and MAIL_FROM, sending is simulated and logged.
  SMTP_HOST:     optionalString,
  SMTP_PORT:     z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(587)),
  SMTP_USER:     optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM:     z.preprocess(emptyToUndefined, z.email('MAIL_FROM must be an email address').optional()),

  FORTNOX_CLIENT_ID:     optionalString,
  FORTNOX_CLIENT_SECRET: optionalString,
  FORTNOX_REDIRECT_URI:  optionalUrl,
  FORTNOX_AUTH_BASE:     z.preprocess(emptyToUndefined, z.url().default('https://apps.fortnox.se/oauth-v1')),
  FORTNOX_API_BASE:      z.preprocess(emptyToUndefined, z.url().default('https://api.fortnox.se/3')),

  RETENTION_MONTHS_DEFAULT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(120).default(36)),
});

function resolveDir(p) {
  return isAbsolute(p) ? p : resolve(SERVER_DIR, p);
}

function originOf(u) {
  return new URL(u).origin;
}

/**
 * Parse and validate configuration from an env object.
 * Throws an Error listing every problem; never falls back to insecure defaults.
 */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  if (e.DEMO_MODE === '1' && e.NODE_ENV === 'production') {
    throw new Error('Invalid configuration:\n  - DEMO_MODE: must not be enabled in production');
  }
  if (e.DEMO_AUTO_RESET === '1' && e.DEMO_MODE !== '1') {
    throw new Error('Invalid configuration:\n  - DEMO_AUTO_RESET: needs DEMO_MODE=1 (it wipes the database every night)');
  }
  const dataDir = resolveDir(e.DATA_DIR);

  const corsOrigins = new Set([
    originOf(e.APP_URL),
    originOf(e.PUBLIC_BASE_URL),
    ...(e.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(originOf),
  ]);

  return Object.freeze({
    env:     e.NODE_ENV,
    isProd:  e.NODE_ENV === 'production',
    isTest:  e.NODE_ENV === 'test',
    demoMode: e.DEMO_MODE === '1',
    demoAutoReset: e.DEMO_AUTO_RESET === '1',
    trustProxy: /^\d+$/.test(e.TRUST_PROXY) ? Number(e.TRUST_PROXY) : e.TRUST_PROXY,
    host:    e.HOST,
    port:    e.PORT,
    dataDir,
    dbFile:     join(dataDir, 'akaren.db'),
    photosDir:  join(dataDir, 'photos'),
    backupsDir: join(dataDir, 'backups'),
    backupMirrorDir: e.BACKUP_DIR ? resolveDir(e.BACKUP_DIR) : null,
    clientDist: resolveDir(e.CLIENT_DIST),

    appUrl:        e.APP_URL.replace(/\/$/, ''),
    publicBaseUrl: e.PUBLIC_BASE_URL.replace(/\/$/, ''),
    corsOrigins:   [...corsOrigins],

    jwtSecret:      e.JWT_SECRET,
    encryptionKey:  Buffer.from(e.ENCRYPTION_KEY, 'hex'),
    driverLinkMaxDays: e.DRIVER_LINK_MAX_DAYS,

    anthropic: {
      apiKey:  e.ANTHROPIC_API_KEY ?? null,
      model:   e.ANTHROPIC_MODEL,
      baseUrl: e.ANTHROPIC_BASE_URL ?? null,
      monthlyBudgetUsd: e.AI_MONTHLY_BUDGET_USD,
      demoMode: e.DEMO_MODE === '1',
    },
    elks: {
      username: e.ELKS_USERNAME ?? null,
      password: e.ELKS_PASSWORD ?? null,
      sender:   e.ELKS_SENDER,
      apiBase:  e.ELKS_API_BASE.replace(/\/$/, ''),
      enabled:  Boolean(e.ELKS_USERNAME && e.ELKS_PASSWORD),
    },
    mail: {
      host:     e.SMTP_HOST ?? null,
      port:     e.SMTP_PORT,
      // Port 465 is implicit TLS; anything else (587, 25) upgrades with STARTTLS.
      secure:   e.SMTP_PORT === 465,
      user:     e.SMTP_USER ?? null,
      password: e.SMTP_PASSWORD ?? null,
      from:     e.MAIL_FROM ?? null,
      enabled:  Boolean(e.SMTP_HOST && e.MAIL_FROM),
    },
    fortnox: {
      clientId:     e.FORTNOX_CLIENT_ID ?? null,
      clientSecret: e.FORTNOX_CLIENT_SECRET ?? null,
      redirectUri:  e.FORTNOX_REDIRECT_URI ?? null,
      authBase:     e.FORTNOX_AUTH_BASE.replace(/\/$/, ''),
      apiBase:      e.FORTNOX_API_BASE.replace(/\/$/, ''),
      configured:   Boolean(e.FORTNOX_CLIENT_ID && e.FORTNOX_CLIENT_SECRET && e.FORTNOX_REDIRECT_URI),
    },
    retentionMonthsDefault: e.RETENTION_MONTHS_DEFAULT,
  });
}
