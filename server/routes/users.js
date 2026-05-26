import { Router }      from 'express';
import { randomBytes }  from 'node:crypto';
import bcrypt           from 'bcryptjs';
import db               from '../db.js';
import { sendMail }     from '../utils/mailer.js';

const router = Router();

const VALID_ROLES = ['agare', 'trafikledare', 'ekonomi', 'forare', 'revisor'];

const ROLE_LABELS = {
  agare:        'Ägare',
  trafikledare: 'Trafikledare',
  ekonomi:      'Ekonomi',
  forare:       'Förare',
  revisor:      'Revisor',
};

const stmtList = db.prepare(`
  SELECT id, name, email, role, active, last_login, created_at, driver_id
  FROM users
  WHERE company_id = ?
  ORDER BY created_at ASC
`);

const stmtById = db.prepare(
  'SELECT * FROM users WHERE id = ? AND company_id = ?'
);

const stmtCreate = db.prepare(`
  INSERT INTO users (company_id, name, email, password_hash, role, active, invite_token, invite_expires_at)
  VALUES (?, ?, ?, '', ?, 0, ?, ?)
`);

const stmtUpdate = db.prepare(`
  UPDATE users SET role = ?, active = ?, driver_id = ? WHERE id = ? AND company_id = ?
`);

// GET / — list users in this company (agare only, enforced in index.js)
router.get('/', (req, res) => {
  try {
    res.json(stmtList.all(req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /invite — create invited user + send setup email
router.post('/invite', async (req, res) => {
  const { email, name, role, driver_id } = req.body ?? {};

  if (!email?.trim())            return res.status(400).json({ error: 'email required' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });

  const cleanEmail  = email.trim().toLowerCase();
  const displayName = (name ?? '').trim() || cleanEmail.split('@')[0];

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const token     = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  try {
    const r = stmtCreate.run(req.companyId, displayName, cleanEmail, role, token, expiresAt);

    if (driver_id) {
      db.prepare('UPDATE users SET driver_id = ? WHERE id = ?').run(Number(driver_id), r.lastInsertRowid);
    }

    const company  = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.companyId);
    const setupUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/setup-account?token=${token}`;
    const roleLabel = ROLE_LABELS[role] ?? role;

    const result = await sendMail({
      to: cleanEmail,
      subject: `Inbjudan till ${company?.name ?? 'Åkaren TMS'}`,
      text: [
        `Hej ${displayName},`,
        '',
        `Du har blivit inbjuden till ${company?.name ?? 'Åkaren TMS'} som ${roleLabel}.`,
        '',
        `Aktivera ditt konto:\n${setupUrl}`,
        '',
        'Länken är giltig i 7 dagar.',
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#151210">
          <div style="background:#0d0d0f;padding:22px 28px;border-radius:10px 10px 0 0">
            <span style="font-size:17px;font-weight:700;color:#c9921e;letter-spacing:-0.01em">${company?.name ?? 'Åkaren TMS'}</span>
          </div>
          <div style="border:1px solid #e6e2da;border-top:none;border-radius:0 0 10px 10px;padding:28px">
            <p style="margin:0 0 8px;color:#6a6050;line-height:1.7">
              Hej <strong>${displayName}</strong>,
            </p>
            <p style="margin:0 0 20px;color:#6a6050;line-height:1.7">
              Du har blivit inbjuden till <strong>${company?.name ?? 'Åkaren TMS'}</strong> som
              <strong style="color:#151210">${roleLabel}</strong>.
            </p>
            <a href="${setupUrl}"
               style="display:inline-block;background:#1C1917;color:#fff;padding:12px 24px;
                      border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;
                      margin-bottom:20px">
              Aktivera konto →
            </a>
            <p style="margin:0;font-size:12px;color:#9a9082">
              Länken är giltig i 7 dagar. Om du inte förväntade dig detta mejl kan du ignorera det.
            </p>
          </div>
        </div>`,
    });

    res.status(201).json({
      id:        r.lastInsertRowid,
      email:     cleanEmail,
      role,
      simulated: Boolean(result?.simulated),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update role / active / driver_id
router.patch('/:id', (req, res) => {
  try {
    const u = stmtById.get(Number(req.params.id), req.companyId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    // Prevent an agare from locking themselves out
    if (u.id === req.user.userId && req.body?.active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const { role, active, driver_id } = req.body ?? {};
    const newRole   = VALID_ROLES.includes(role) ? role : u.role;
    const newActive = active != null ? (active ? 1 : 0) : u.active;
    const newDriver = driver_id !== undefined ? (driver_id || null) : u.driver_id;

    stmtUpdate.run(newRole, newActive, newDriver, u.id, req.companyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
