import { Router } from 'express';
import bcrypt      from 'bcryptjs';
import jwt         from 'jsonwebtoken';
import db          from '../db.js';

const router     = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRY = '24h';

// ── Input validation helpers ──────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function validateEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim()) && email.length <= 320;
}

function sanitizeStr(val, maxLen = 255) {
  if (typeof val !== 'string') return null;
  return val.trim().slice(0, maxLen) || null;
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtUserByEmail   = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtCompanyById   = db.prepare('SELECT * FROM companies WHERE id = ?');
const stmtUpdateLogin   = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');

const stmtInsertCompany = db.prepare(`
  INSERT INTO companies (name, org_nr, address, phone, email, brand_color, bankgiro)
  VALUES (?, ?, ?, ?, ?, '#c9a84c', ?)
`);
const stmtInsertUser = db.prepare(`
  INSERT INTO users (company_id, name, email, password_hash, role, active)
  VALUES (?, ?, ?, ?, 'agare', 1)
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign(
    {
      userId:    user.id,
      companyId: user.company_id,
      email:     user.email,
      role:      user.role,
      driverId:  user.driver_id ?? null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );
}

function safeUser(u) {
  return {
    id:             u.id,
    name:           u.name,
    email:          u.email,
    role:           u.role,
    driver_id:      u.driver_id ?? null,
    tos_accepted_at: u.tos_accepted_at ?? null,
  };
}

function safeCompany(row) {
  if (!row) return null;
  const { fortnox_token, ...rest } = row;
  return rest;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!validateEmail(email)) return res.status(400).json({ error: 'Valid email required' });
  if (typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    const user = stmtUserByEmail.get(email.trim().toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.active === 0) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)  return res.status(401).json({ error: 'Invalid credentials' });

    stmtUpdateLogin.run(user.id);

    const company = stmtCompanyById.get(user.company_id);
    const token   = makeToken(user);

    res.json({ token, user: safeUser(user), company: safeCompany(company) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/register — creates company + first owner user ──────────────
router.post('/register', async (req, res) => {
  const {
    company_name, org_nr, address, phone, email: companyEmail, bankgiro,
    user_name, user_email, password,
  } = req.body ?? {};

  const cleanCompany = sanitizeStr(company_name, 200);
  const cleanEmail   = sanitizeStr(user_email, 320)?.toLowerCase();

  if (!cleanCompany)              return res.status(400).json({ error: 'company_name required' });
  if (!validateEmail(cleanEmail)) return res.status(400).json({ error: 'Valid user_email required' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (password.length > 1024) return res.status(400).json({ error: 'Password too long' });

  try {
    const existing = stmtUserByEmail.get(cleanEmail);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);

    db.exec('BEGIN');
    let companyId, userId;
    try {
      const cr = stmtInsertCompany.run(
        cleanCompany,
        sanitizeStr(org_nr, 20),
        sanitizeStr(address, 300),
        sanitizeStr(phone, 30),
        sanitizeStr(companyEmail, 320),
        sanitizeStr(bankgiro, 20),
      );
      companyId = cr.lastInsertRowid;

      const displayName = sanitizeStr(user_name, 100) || cleanEmail.split('@')[0];
      const ur = stmtInsertUser.run(companyId, displayName, cleanEmail, hash);
      userId = ur.lastInsertRowid;
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const user    = { id: userId, company_id: companyId, email: cleanEmail, role: 'agare', driver_id: null };
    const company = stmtCompanyById.get(companyId);
    const token   = makeToken(user);

    res.status(201).json({
      token,
      user:    { id: userId, name: sanitizeStr(user_name, 100) || cleanEmail.split('@')[0], email: cleanEmail, role: 'agare', driver_id: null, tos_accepted_at: null },
      company: safeCompany(company),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/setup — complete account from invite link ──────────────────
router.post('/setup', async (req, res) => {
  const { token, password } = req.body ?? {};

  if (!token) return res.status(400).json({ error: 'token required' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (password.length > 1024) return res.status(400).json({ error: 'Password too long' });

  try {
    const user = db.prepare(`
      SELECT * FROM users
      WHERE invite_token = ?
        AND (invite_expires_at IS NULL OR invite_expires_at > CURRENT_TIMESTAMP)
    `).get(token);

    if (!user) return res.status(400).json({ error: 'Invalid or expired invite link' });

    const hash = await bcrypt.hash(password, 10);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, active = 1, invite_token = NULL, invite_expires_at = NULL
      WHERE id = ?
    `).run(hash, user.id);

    stmtUpdateLogin.run(user.id);
    const company = stmtCompanyById.get(user.company_id);
    const jwt_    = makeToken({ ...user, active: 1 });

    res.json({ token: jwt_, user: safeUser(user), company: safeCompany(company) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/accept-tos ─────────────────────────────────────────────────
router.post('/accept-tos', (req, res) => {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE users SET tos_accepted_at = ?, tos_version = ? WHERE id = ?',
    ).run(now, '2026-05-17', decoded.userId);
    res.json({ tos_accepted_at: now });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
