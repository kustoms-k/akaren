import { createHash, randomBytes } from 'node:crypto';
import { HttpError, notFound, conflict } from '../lib/http.js';
import { stockholmDate } from '../lib/dates.js';
import { linkExpiry, buildAssignmentSms, TYPE_LABELS } from '../lib/dispatch.js';

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Driver magic links and assignment SMS. */
export function createDispatchService({ db, config, sms, audit, now = () => new Date() }) {
  const stmtLastDate = db.prepare(`
    SELECT MAX(datum) FROM job_assignments
    WHERE driver_id = ? AND company_id = ? AND cancelled_at IS NULL AND datum >= ?
  `);
  const stmtInsertLink = db.prepare(`
    INSERT INTO driver_links (company_id, driver_id, token_hash, expires_at) VALUES (?, ?, ?, ?)
  `);
  const stmtLinkByHash = db.prepare(`
    SELECT l.*, d.active AS driver_active, d.anonymized_at
    FROM driver_links l JOIN drivers d ON d.id = l.driver_id
    WHERE l.token_hash = ?
  `);
  const stmtTouchLink = db.prepare(`UPDATE driver_links SET last_used_at = ? WHERE id = ?`);
  const stmtAssignment = db.prepare(`
    SELECT a.*, j.uppdragstyp, j.tid, j.status AS job_status, p.name AS project_name, p.address AS project_address,
           p.ort AS project_ort, d.name AS driver_name, d.phone AS driver_phone, d.active AS driver_active,
           v.regnr, c.name AS company_name
    FROM job_assignments a
    JOIN jobs j ON j.id = a.job_id
    JOIN projects p ON p.id = j.project_id
    JOIN drivers d ON d.id = a.driver_id
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN companies c ON c.id = a.company_id
    WHERE a.id = ? AND a.company_id = ?
  `);
  const stmtSmsStatus = db.prepare(`UPDATE job_assignments SET sms_status = ?, sms_sent_at = ? WHERE id = ?`);
  const stmtRevokeAll = db.prepare(`
    UPDATE driver_links SET revoked_at = ? WHERE driver_id = ? AND company_id = ? AND revoked_at IS NULL
  `);

  /** Create a new link for a driver. The plain token exists only in the returned URL. */
  function issueLink(companyId, driverId) {
    const t = now();
    const lastAssignedDate = stmtLastDate.pluck().get(driverId, companyId, stockholmDate(t));
    const expiresAt = linkExpiry({ now: t, lastAssignedDate, maxDays: config.driverLinkMaxDays });
    const token = randomBytes(16).toString('base64url');
    const linkId = Number(stmtInsertLink.run(companyId, driverId, hashToken(token), expiresAt).lastInsertRowid);
    return { linkId, token, url: `${config.publicBaseUrl}/f/${token}`, expiresAt };
  }

  /** Validate a token from an SMS link. Returns the link row or null. */
  function redeemLink(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const link = stmtLinkByHash.get(hashToken(token));
    if (!link || link.revoked_at || Date.parse(link.expires_at) <= now().getTime() || !link.driver_active || link.anonymized_at) {
      return null;
    }
    stmtTouchLink.run(now().toISOString(), link.id);
    return link;
  }

  function revokeDriverLinks(companyId, driverId) {
    return stmtRevokeAll.run(now().toISOString(), driverId, companyId).changes;
  }

  function loadActiveAssignment(companyId, assignmentId) {
    const a = stmtAssignment.get(assignmentId, companyId);
    if (!a) throw notFound('Tilldelningen finns inte.');
    if (a.cancelled_at) throw conflict('cancelled', 'Tilldelningen är avbokad.');
    return a;
  }

  /** A fresh link for the assignment's driver without sending an SMS (shown as a QR code in the office). */
  function issueAssignmentLink({ companyId, assignmentId, actor }) {
    const a = loadActiveAssignment(companyId, assignmentId);
    if (!a.driver_active) throw new HttpError(400, 'driver_inactive', 'Föraren är inaktiv.');
    const link = issueLink(companyId, a.driver_id);
    audit({ ...actor, entity: 'assignment', entityId: a.id, action: 'issue_link', after: { link_id: link.linkId } });
    return { link: link.url, expires_at: link.expiresAt, driver_name: a.driver_name };
  }

  /** Send (or re-send) the SMS for an assignment with a fresh magic link. */
  async function sendAssignmentSms({ companyId, assignmentId, actor }) {
    const a = loadActiveAssignment(companyId, assignmentId);
    if (!a.driver_active || !a.driver_phone) throw new HttpError(400, 'no_phone', 'Föraren saknar mobilnummer.');

    const link = issueLink(companyId, a.driver_id);
    const text = buildAssignmentSms({
      driverName: a.driver_name, datum: a.datum, tid: a.tid, typeLabel: TYPE_LABELS[a.uppdragstyp],
      projectName: a.project_name, address: [a.project_address, a.project_ort].filter(Boolean).join(' '),
      regnr: a.regnr, link: link.url, companyName: a.company_name,
    });
    const result = await sms.send(a.driver_phone, text);
    stmtSmsStatus.run(result.status, now().toISOString(), a.id);
    audit({ ...actor, entity: 'assignment', entityId: a.id, action: 'send_sms', after: { status: result.status, link_id: link.linkId } });
    return { status: result.status, link: link.url, expires_at: link.expiresAt, text };
  }

  return { issueLink, issueAssignmentLink, redeemLink, revokeDriverLinks, sendAssignmentSms };
}
