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

  // ── Driver: magic link -> short session scoped to one driver ──
  const stmtLink = db.prepare(`
    SELECT l.id, l.driver_id, l.company_id, l.expires_at, l.revoked_at, d.name, d.active, d.anonymized_at
    FROM driver_links l JOIN drivers d ON d.id = l.driver_id
    WHERE l.id = ?
  `);

  /** Session token for a validated link; expires together with the link. */
  function signDriverToken(link) {
    const seconds = Math.max(60, Math.floor((Date.parse(link.expires_at) - Date.now()) / 1000));
    return jwt.sign(
      { sub: String(link.driver_id), cid: link.company_id, lid: link.id, role: 'driver' },
      config.jwtSecret,
      { expiresIn: seconds },
    );
  }

  const linkExpired = () => new HttpError(401, 'link_expired', 'Länken har gått ut. Be kontoret skicka en ny.');

  function requireDriver(req, res, next) {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return next(linkExpired());
    let payload;
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret);
    } catch {
      return next(linkExpired());
    }
    if (payload.role !== 'driver') return next(linkExpired());
    // Checked on every request so revoking a link or removing a driver takes effect immediately.
    const link = stmtLink.get(payload.lid);
    if (!link || link.revoked_at || Date.parse(link.expires_at) <= Date.now()
      || !link.active || link.anonymized_at || String(link.driver_id) !== payload.sub) {
      return next(linkExpired());
    }
    req.driver = { id: link.driver_id, name: link.name, linkId: link.id, companyId: link.company_id };
    req.companyId = link.company_id;
    next();
  }

  return { signOfficeToken, requireOffice, signDriverToken, requireDriver };
}
