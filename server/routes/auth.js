import { Router } from 'express';
import bcrypt      from 'bcryptjs';
import jwt         from 'jsonwebtoken';
import db          from '../db.js';

const router     = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRY = '24h';

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtUserByEmail   = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtCompanyById   = db.prepare('SELECT * FROM companies WHERE id = ?');
const stmtUpdateLogin   = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');

const stmtInsertCompany = db.prepare(`
  INSERT INTO companies (name, org_nr, address, phone, email, brand_color, bankgiro)
  VALUES (?, ?, ?, ?, ?, '#c9a84c', ?)
`);
const stmtInsertUser = db.prepare(`
  INSERT INTO users (company_id, name, email, password_hash, role)
  VALUES (?, ?, ?, ?, 'owner')
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign(
    { userId: user.id, companyId: user.company_id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );
}

function safeCompany(row) {
  if (!row) return null;
  const { fortnox_token, ...rest } = row;  // never expose integration tokens
  return rest;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = stmtUserByEmail.get(email.trim().toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)  return res.status(401).json({ error: 'Invalid credentials' });

    stmtUpdateLogin.run(user.id);

    const company = stmtCompanyById.get(user.company_id);
    const token   = makeToken(user);

    res.json({
      token,
      user:    { id: user.id, name: user.name, email: user.email, role: user.role },
      company: safeCompany(company),
    });
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

  if (!company_name?.trim() || !user_email?.trim() || !password) {
    return res.status(400).json({ error: 'company_name, user_email, and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = stmtUserByEmail.get(user_email.trim().toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);

    // Atomic insert: company then owner user
    db.exec('BEGIN');
    let companyId, userId;
    try {
      const cr = stmtInsertCompany.run(
        company_name.trim(),
        org_nr?.trim()        ?? null,
        address?.trim()       ?? null,
        phone?.trim()         ?? null,
        companyEmail?.trim()  ?? null,
        bankgiro?.trim()      ?? null,
      );
      companyId = cr.lastInsertRowid;

      const displayName = user_name?.trim() || user_email.split('@')[0];
      const ur = stmtInsertUser.run(
        companyId,
        displayName,
        user_email.trim().toLowerCase(),
        hash,
      );
      userId = ur.lastInsertRowid;
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const user    = { id: userId, company_id: companyId, email: user_email.trim().toLowerCase(), role: 'owner' };
    const company = stmtCompanyById.get(companyId);
    const token   = makeToken(user);

    res.status(201).json({
      token,
      user:    { id: userId, name: user_name?.trim() || user_email.split('@')[0], email: user.email, role: 'owner' },
      company: safeCompany(company),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
