import express           from 'express';
import https             from 'node:https';
import fs                from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode            from 'qrcode';
import jwt               from 'jsonwebtoken';
import db                from '../db.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const router     = express.Router();

const BANKID_ENV  = process.env.BANKID_ENV || 'test';
const BANKID_HOST = BANKID_ENV === 'production'
  ? 'appapi2.bankid.com'
  : 'appapi2.test.bankid.com';

const JWT_SECRET  = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const CERT_PATH   = process.env.BANKID_CERT_PATH
  || join(__dirname, '..', 'certs', 'bankid.p12');
const CERT_PASS   = process.env.BANKID_CERT_PASSPHRASE || 'qwerty123';

// ── Certificate helpers ───────────────────────────────────────────────────────
function certExists() {
  try { fs.accessSync(CERT_PATH); return true; } catch { return false; }
}

function getAgent() {
  return new https.Agent({
    pfx:                  fs.readFileSync(CERT_PATH),
    passphrase:           CERT_PASS,
    rejectUnauthorized:   BANKID_ENV !== 'test',
  });
}

// ── Low-level BankID API call ─────────────────────────────────────────────────
function bankidPost(path, body, agent) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(
      {
        hostname: BANKID_HOST,
        path:     `/rp/v6.0${path}`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        agent,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 400) {
              const err = new Error(parsed.errorCode || 'BankID error');
              err.code  = parsed.errorCode;
              reject(err);
            } else {
              resolve(parsed);
            }
          } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── QR helpers ────────────────────────────────────────────────────────────────
function qrString(qrStartToken, qrStartSecret, startTime) {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const code    = createHmac('sha256', qrStartSecret).update(String(elapsed)).digest('hex');
  return `bankid.${qrStartToken}.${elapsed}.${code}`;
}

async function makeQR(qrStartToken, qrStartSecret, startTime) {
  return QRCode.toDataURL(qrString(qrStartToken, qrStartSecret, startTime), {
    width: 220, margin: 1,
    color: { dark: '#193E8F', light: '#FFFFFF' },
  });
}

// ── Real BankID session store ─────────────────────────────────────────────────
const sessions = new Map(); // orderRef → { qrStartToken, qrStartSecret, startTime }

function storeSession(orderRef, qrStartToken, qrStartSecret) {
  const startTime = Date.now();
  sessions.set(orderRef, { qrStartToken, qrStartSecret, startTime });
  setTimeout(() => sessions.delete(orderRef), 5 * 60 * 1000);
  return startTime;
}

// ── Simulation mode (no cert present) ────────────────────────────────────────
const simSessions = new Map(); // orderRef → { qrStartToken, qrStartSecret, startTime, poll }

async function simStart() {
  const orderRef      = randomBytes(16).toString('hex');
  const qrStartToken  = randomBytes(16).toString('hex');
  const qrStartSecret = randomBytes(16).toString('hex');
  const startTime     = Date.now();
  simSessions.set(orderRef, { qrStartToken, qrStartSecret, startTime, poll: 0 });
  setTimeout(() => simSessions.delete(orderRef), 5 * 60 * 1000);

  const qrCode      = await makeQR(qrStartToken, qrStartSecret, startTime);
  const autoStartUrl = `bankid:///?autostarttoken=${randomBytes(8).toString('hex')}&redirect=null`;
  return { orderRef, autoStartUrl, qrCode, simulated: true };
}

const SIM_HINTS = ['outstandingTransaction', 'outstandingTransaction', 'started', 'userSign'];

async function simCollect(orderRef) {
  const sess = simSessions.get(orderRef);
  if (!sess) return { status: 'failed', hintCode: 'expiredTransaction' };

  sess.poll += 1;

  if (sess.poll >= 5) {
    simSessions.delete(orderRef);
    // Use configurable test personnummer or default
    const personnummer = process.env.BANKID_SIM_PERSONNUMMER || '198001019876';
    const name         = process.env.BANKID_SIM_NAME        || 'Testperson';
    return { status: 'complete', personnummer, name };
  }

  const qrCode  = await makeQR(sess.qrStartToken, sess.qrStartSecret, sess.startTime);
  const hintCode = SIM_HINTS[sess.poll - 1] || 'outstandingTransaction';
  return { status: 'pending', hintCode, qrCode };
}

// ── DB helpers ────────────────────────────────────────────────────────────────
const stmtByPnr      = db.prepare(`SELECT * FROM users WHERE bankid_personnummer = ? AND active = 1 LIMIT 1`);
const stmtCompany    = db.prepare(`SELECT * FROM companies WHERE id = ?`);
const stmtUpdateLogin = db.prepare(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`);

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, driver_id: u.driver_id ?? null, tos_accepted_at: u.tos_accepted_at ?? null };
}

function safeCompany(row) {
  if (!row) return null;
  const { fortnox_token, ...rest } = row;
  return rest;
}

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, companyId: user.company_id, email: user.email, role: user.role, driverId: user.driver_id ?? null },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

function resolveLogin(personnummer) {
  const pnr  = personnummer.replace(/\D/g, '');
  const user = stmtByPnr.get(pnr);
  if (!user) return null;
  const company = stmtCompany.get(user.company_id);
  stmtUpdateLogin.run(user.id);
  return { token: makeToken(user), user: safeUser(user), company: safeCompany(company) };
}

// ── Get real end-user IP (behind Railway proxy) ───────────────────────────────
function getIp(req) {
  return (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
}

// ── POST /api/auth/bankid/start ───────────────────────────────────────────────
router.post('/start', async (req, res) => {
  try {
    if (!certExists()) {
      const data = await simStart();
      return res.json(data);
    }

    const agent   = getAgent();
    const data    = await bankidPost('/auth', { endUserIp: getIp(req) }, agent);
    const { orderRef, autoStartToken, qrStartToken, qrStartSecret } = data;

    const startTime  = storeSession(orderRef, qrStartToken, qrStartSecret);
    const qrCode     = await makeQR(qrStartToken, qrStartSecret, startTime);
    const autoStartUrl = `bankid:///?autostarttoken=${autoStartToken}&redirect=null`;

    res.json({ orderRef, autoStartUrl, qrCode });
  } catch (err) {
    console.error('[BankID] start error:', err.message);
    res.status(500).json({ error: 'BankID-tjänsten är inte tillgänglig just nu.' });
  }
});

// ── POST /api/auth/bankid/collect ─────────────────────────────────────────────
router.post('/collect', async (req, res) => {
  const { orderRef } = req.body ?? {};
  if (!orderRef) return res.status(400).json({ error: 'orderRef required' });

  // Simulation mode
  if (simSessions.has(orderRef)) {
    const result = await simCollect(orderRef);
    if (result.status === 'complete') {
      const session = resolveLogin(result.personnummer);
      if (!session) {
        return res.json({ status: 'no_user', simulated: true });
      }
      return res.json({ status: 'complete', ...session });
    }
    return res.json(result);
  }

  // Real BankID
  const sess = sessions.get(orderRef);
  if (!sess) return res.status(404).json({ error: 'Session utgången eller hittades inte.' });

  try {
    const agent  = getAgent();
    const data   = await bankidPost('/collect', { orderRef }, agent);
    const { status, hintCode, completionData } = data;

    if (status === 'failed') {
      sessions.delete(orderRef);
      return res.json({ status: 'failed', hintCode });
    }

    if (status === 'complete') {
      sessions.delete(orderRef);
      const personnummer = completionData.user.personalNumber;

      const session = resolveLogin(personnummer);
      if (!session) {
        return res.json({ status: 'no_user' });
      }
      return res.json({ status: 'complete', ...session });
    }

    // Still pending — return fresh QR
    const qrCode = await makeQR(sess.qrStartToken, sess.qrStartSecret, sess.startTime);
    res.json({ status: 'pending', hintCode, qrCode });
  } catch (err) {
    console.error('[BankID] collect error:', err.message);
    sessions.delete(orderRef);
    res.status(500).json({ status: 'failed', error: 'BankID-tjänsten svarade inte.' });
  }
});

// ── POST /api/auth/bankid/cancel ──────────────────────────────────────────────
router.post('/cancel', async (req, res) => {
  const { orderRef } = req.body ?? {};
  if (!orderRef) return res.json({ ok: true });

  if (simSessions.has(orderRef)) {
    simSessions.delete(orderRef);
    return res.json({ ok: true });
  }

  const sess = sessions.get(orderRef);
  sessions.delete(orderRef);

  if (sess) {
    try {
      const agent = getAgent();
      await bankidPost('/cancel', { orderRef }, agent);
    } catch {}
  }

  res.json({ ok: true });
});

export default router;
