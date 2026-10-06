import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError, asyncHandler, validate } from '../lib/http.js';

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const MIN_PASSWORD = 10;

const passwordSchema = z.object({
  current_password: z.string({ error: 'Obligatoriskt.' }).min(1, 'Obligatoriskt.').max(1024),
  new_password: z.string({ error: 'Obligatoriskt.' }).min(MIN_PASSWORD, `Minst ${MIN_PASSWORD} tecken.`).max(200, 'Högst 200 tecken.'),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(320),
  password: z.string().min(1).max(1024),
});

export function authRouter({ db, config, auth, limiters, audit }) {
  const router = Router();
  const stmtByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const stmtFirstActive = db.prepare('SELECT * FROM users WHERE active = 1 ORDER BY id LIMIT 1');
  const stmtTouch = db.prepare(`UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`);
  const stmtCompany = db.prepare('SELECT id, name FROM companies WHERE id = ?');

  const invalid = () => new HttpError(401, 'invalid_credentials', 'Fel e-post eller lösenord.');

  function session(res, user) {
    stmtTouch.run(user.id);
    res.json({
      token: auth.signOfficeToken(user),
      user: { id: user.id, name: user.name, email: user.email },
      company: stmtCompany.get(user.company_id),
    });
  }

  router.post('/login', limiters.login, asyncHandler(async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);
    const user = stmtByEmail.get(email);
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw invalid();
    if (!user.active) throw new HttpError(403, 'inactive', 'Kontot är inaktiverat.');
    session(res, user);
  }));

  // DEMO_MODE only (config refuses it in production): log in as the first office user without a password,
  // so a prospect demo is one click. The route doesn't exist otherwise.
  router.get('/demo', (req, res) => res.json({ enabled: config.demoMode }));
  if (config.demoMode) {
    router.post('/demo-login', limiters.login, (req, res) => {
      const user = stmtFirstActive.get();
      if (!user) throw new HttpError(409, 'no_demo_user', 'Det finns ingen användare att logga in som. Kör npm run seed först.');
      session(res, user);
    });
  }

  // An office user changes their own password; the current one is required.
  const stmtHash = db.prepare('SELECT password_hash FROM users WHERE id = ?');
  const stmtSetHash = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  router.post('/password', auth.requireOffice, limiters.login, asyncHandler(async (req, res) => {
    const input = validate(passwordSchema, req.body);
    const ok = await bcrypt.compare(input.current_password, stmtHash.pluck().get(req.user.id));
    if (!ok) throw new HttpError(400, 'invalid_input', 'Nuvarande lösenord stämmer inte.', { fields: { current_password: 'Stämmer inte.' } });
    if (input.new_password === input.current_password) {
      throw new HttpError(400, 'invalid_input', 'Välj ett nytt lösenord.', { fields: { new_password: 'Samma som det nuvarande.' } });
    }
    stmtSetHash.run(await bcrypt.hash(input.new_password, 12), req.user.id);
    audit({ companyId: req.companyId, actorKind: 'office', actorId: req.user.id, entity: 'user', entityId: req.user.id, action: 'change_password', ip: req.ip });
    res.json({ ok: true });
  }));

  router.get('/me', auth.requireOffice, (req, res) => {
    res.json({
      user: { id: req.user.id, name: req.user.name, email: req.user.email },
      company: stmtCompany.get(req.companyId),
    });
  });

  return router;
}
