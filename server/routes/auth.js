import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError, asyncHandler, validate } from '../lib/http.js';

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(320),
  password: z.string().min(1).max(1024),
});

export function authRouter({ db, config, auth, limiters }) {
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

  router.get('/me', auth.requireOffice, (req, res) => {
    res.json({
      user: { id: req.user.id, name: req.user.name, email: req.user.email },
      company: stmtCompany.get(req.companyId),
    });
  });

  return router;
}
