import cron from 'node-cron';
import { rmSync } from 'node:fs';
import { addMonths, stockholmDate, stockholmLocalToUtc } from '../lib/dates.js';
import { createAudit } from '../lib/audit.js';
import { photoPath } from '../services/photos.js';

/**
 * Anonymise a driver: the name becomes "Raderad förare #id", the phone number is removed and every
 * link is revoked. The row stays so lass and assignments keep their history.
 */
export function anonymizeDriver(db, { companyId, driverId, at = new Date() }) {
  const ts = at.toISOString();
  return db.transaction(() => {
    const changed = db.prepare(`
      UPDATE drivers SET name = 'Raderad förare #' || id, phone = NULL, active = 0, anonymized_at = ?
      WHERE id = ? AND company_id = ? AND anonymized_at IS NULL
    `).run(ts, driverId, companyId).changes;
    if (changed) {
      db.prepare('UPDATE driver_links SET revoked_at = ? WHERE driver_id = ? AND company_id = ? AND revoked_at IS NULL')
        .run(ts, driverId, companyId);
    }
    return changed > 0;
  })();
}

/**
 * Enforce each company's retention period (companies.retention_months, decision D5):
 * - vågsedel photos older than the period are deleted from disk and marked deleted_at;
 * - drivers who are inactive and have had no assignments, lass or link use within the period are anonymised.
 * Lass records themselves are kept: they are the spårbarhet and bookkeeping record.
 * Returns per-company counts.
 */
export function runRetention({ db, config, now = new Date(), logger = console }) {
  const audit = createAudit(db, logger);
  const companies = db.prepare('SELECT id, retention_months FROM companies').all();
  const stmtPhotos = db.prepare(`
    SELECT id FROM photos WHERE company_id = ? AND deleted_at IS NULL AND created_at < ?
  `);
  const stmtDeletePhoto = db.prepare('UPDATE photos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL');
  const stmtIdleDrivers = db.prepare(`
    SELECT d.id FROM drivers d
    WHERE d.company_id = @cid AND d.active = 0 AND d.anonymized_at IS NULL AND d.created_at < @cutoffUtc
      AND NOT EXISTS (SELECT 1 FROM job_assignments a WHERE a.driver_id = d.id AND a.datum >= @cutoffDate)
      AND NOT EXISTS (SELECT 1 FROM lass_versions v WHERE v.driver_id = d.id AND v.datum >= @cutoffDate)
      AND NOT EXISTS (SELECT 1 FROM driver_links l WHERE l.driver_id = d.id
                      AND COALESCE(l.last_used_at, l.created_at) >= @cutoffUtc)
  `);

  const results = [];
  for (const company of companies) {
    const cutoffDate = addMonths(stockholmDate(now), -company.retention_months);
    const cutoffUtc = stockholmLocalToUtc(cutoffDate, '00:00');
    const system = { companyId: company.id, actorKind: 'system' };

    const photoIds = stmtPhotos.pluck().all(company.id, cutoffUtc);
    for (const id of photoIds) {
      rmSync(photoPath(config.photosDir, id), { force: true });
      stmtDeletePhoto.run(now.toISOString(), id);
    }
    if (photoIds.length) {
      audit({ ...system, entity: 'photo', action: 'retention_delete', after: { cutoff: cutoffDate, count: photoIds.length, ids: photoIds } });
    }

    const driverIds = stmtIdleDrivers.pluck().all({ cid: company.id, cutoffDate, cutoffUtc });
    for (const driverId of driverIds) {
      if (anonymizeDriver(db, { companyId: company.id, driverId, at: now })) {
        audit({ ...system, entity: 'driver', entityId: driverId, action: 'retention_anonymize', after: { cutoff: cutoffDate } });
      }
    }

    results.push({ companyId: company.id, cutoff: cutoffDate, photos: photoIds.length, drivers: driverIds.length });
  }
  const total = results.reduce((s, r) => ({ photos: s.photos + r.photos, drivers: s.drivers + r.drivers }), { photos: 0, drivers: 0 });
  logger.log(`[retention] deleted ${total.photos} photos, anonymised ${total.drivers} drivers`);
  return results;
}

/** Nightly at 01:30 Stockholm time, before the 02:00 backup so the mirror drops deleted photos the same night. */
export function scheduleRetention(deps) {
  return cron.schedule('30 1 * * *', () => {
    try {
      runRetention(deps);
    } catch (err) {
      (deps.logger ?? console).error('[retention] failed:', err.message);
    }
  }, { timezone: 'Europe/Stockholm' });
}
