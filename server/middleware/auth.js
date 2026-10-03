import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/http.js';

// Two roles only: 'office' (this JWT) and 'driver' (magic link, added with the driver page).
const OFFICE_TOKEN_TTL = '12h';

const unauthorized = () => new HttpError(401, 'unauthorized', 'Du behöver logga in igen.');

export function createAuth({ db, config }) {
  const stmtUser = db.prepare(
    'SELECT id, company_id, name, email, active FROM users WHERE id = ?',
  );

  function signOfficeToken(user) {
    return jwt.sign(
      { sub: String(user.id), cid: user.company_id, role: 'office' },
      config.jwtSecret,
      { expiresIn: OFFICE_TOKEN_TTL },
    );
  }

  function requireOffice(req, res, next) {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return next(unauthorized());
    let payload;
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret);
    } catch {
      return next(unauthorized());
    }
    if (payload.role !== 'office') return next(unauthorized());

    // Checked on every request so deactivating a user takes effect immediately.
    const user = stmtUser.get(Number(payload.sub));
    if (!user || !user.active || user.company_id !== payload.cid) return next(unauthorized());

    req.user = user;
    req.companyId = user.company_id;
    next();
  }

  return { signOfficeToken, requireOffice };
}
