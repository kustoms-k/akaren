import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { normalizeOrgNr } from './normalize.js';

// Creating customer companies and office users on a hosted installation (there is no sign-up page).
// Used by scripts/account.js; pure apart from the database.

/** A random password that is easy to read out over the phone: four groups of four letters and digits. */
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';   // no l/1/i/o/0
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return chars.match(/.{4}/g).join('-');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Create a company and its first office user. Returns { companyId, userId, email, password }. */
export function createCompany(db, { name, orgNr = null, email, userName = 'Kontoret', password = generatePassword(), retentionMonths = 36 }) {
  if (!name?.trim()) throw new Error('Company name is required');
  if (!EMAIL.test(email ?? '')) throw new Error('A valid email is required');
  const org = orgNr ? normalizeOrgNr(orgNr) : null;
  if (orgNr && !org) throw new Error(`Invalid organisationsnummer: ${orgNr}`);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Error(`A user with ${email} already exists`);
  return db.transaction(() => {
    const companyId = Number(db.prepare(`INSERT INTO companies (name, org_nr, email, retention_months) VALUES (?, ?, ?, ?)`)
      .run(name.trim(), org, email, retentionMonths).lastInsertRowid);
    const userId = addUserTo(db, { companyId, email, userName, password });
    return { companyId, userId, email, password };
  })();
}

/** Add an office user to an existing company. Returns the user id. */
export function addUser(db, { companyId, email, userName, password = generatePassword() }) {
  if (!db.prepare('SELECT 1 FROM companies WHERE id = ?').get(companyId)) throw new Error(`No company with id ${companyId}`);
  if (!EMAIL.test(email ?? '')) throw new Error('A valid email is required');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Error(`A user with ${email} already exists`);
  return { userId: addUserTo(db, { companyId, email, userName, password }), email, password };
}

function addUserTo(db, { companyId, email, userName, password }) {
  return Number(db.prepare('INSERT INTO users (company_id, name, email, password_hash) VALUES (?, ?, ?, ?)')
    .run(companyId, userName?.trim() || 'Kontoret', email.trim().toLowerCase(), bcrypt.hashSync(password, 12)).lastInsertRowid);
}

/** Companies with their user count, for listing. */
export function listCompanies(db) {
  return db.prepare(`
    SELECT c.id, c.name, c.org_nr, c.created_at,
           (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS users,
           (SELECT COUNT(*) FROM lass l WHERE l.company_id = c.id) AS lass
    FROM companies c ORDER BY c.id`).all();
}
