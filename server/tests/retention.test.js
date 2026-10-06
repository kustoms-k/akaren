import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runRetention, anonymizeDriver } from '../jobs/retention.js';
import { runBackup } from '../jobs/backup.js';
import { photoPath } from '../services/photos.js';
import { testConfig, testDb, addCompanyWithUser, silentLogger } from './helpers.js';

const NOW = new Date('2026-10-05T10:00:00Z');
const OLD = '2025-06-01T08:00:00.000Z';    // more than 12 months before NOW
const RECENT = '2026-09-01T08:00:00.000Z';

let ctx;
beforeEach(() => {
  const dataDir = mkdtempSync(join(tmpdir(), 'akaren-retention-'));
  const config = testConfig({ DATA_DIR: dataDir, BACKUP_DIR: join(dataDir, 'mirror') });
  const db = testDb();
  const { companyId, userId } = addCompanyWithUser(db);
  db.prepare('UPDATE companies SET retention_months = 12 WHERE id = ?').run(companyId);

  const addPhoto = (id, createdAt) => {
    db.prepare(`INSERT INTO photos (id, company_id, sha256, bytes, created_at) VALUES (?, ?, 'x', 3, ?)`).run(id, companyId, createdAt);
    const file = photoPath(config.photosDir, id);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'jpg');
    return file;
  };
  const addDriver = (name, { active = 0, createdAt = OLD } = {}) => Number(db.prepare(
    'INSERT INTO drivers (company_id, name, phone, active, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(companyId, name, '+46701740605', active, createdAt).lastInsertRowid);

  ctx = { db, config, companyId, userId, addPhoto, addDriver };
});

describe('retention job', () => {
  it('deletes photos older than the retention period and keeps newer ones', () => {
    const { db, config, addPhoto } = ctx;
    const oldFile = addPhoto('a'.repeat(32), OLD);
    const newFile = addPhoto('b'.repeat(32), RECENT);

    const [result] = runRetention({ db, config, now: NOW, logger: silentLogger });
    expect(result).toMatchObject({ cutoff: '2025-10-05', photos: 1 });
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(newFile)).toBe(true);
    expect(db.prepare('SELECT id FROM photos WHERE deleted_at IS NOT NULL').pluck().all()).toEqual(['a'.repeat(32)]);
    const audit = db.prepare(`SELECT actor_kind, action, after_json FROM audit_log WHERE entity = 'photo'`).get();
    expect(audit).toMatchObject({ actor_kind: 'system', action: 'retention_delete' });
    expect(JSON.parse(audit.after_json)).toMatchObject({ count: 1, ids: ['a'.repeat(32)] });

    // Running again changes nothing.
    expect(runRetention({ db, config, now: NOW, logger: silentLogger })[0].photos).toBe(0);
  });

  it('anonymises drivers who left before the period and keeps everyone else', () => {
    const { db, config, companyId, userId, addDriver } = ctx;
    const gone = addDriver('Gamle Gösta');
    const active = addDriver('Aktiva Anna', { active: 1 });
    const recentWork = addDriver('Nyss slutat Nils');
    const newHire = addDriver('Ny Nora', { createdAt: RECENT });

    const customerId = db.prepare('INSERT INTO customers (company_id, name) VALUES (?, ?)').run(companyId, 'Kund AB').lastInsertRowid;
    const projectId = db.prepare('INSERT INTO projects (company_id, customer_id, name) VALUES (?, ?, ?)').run(companyId, customerId, 'P').lastInsertRowid;
    const jobId = db.prepare(`INSERT INTO jobs (company_id, customer_id, project_id, uppdragstyp, datum_fran, created_by_user_id)
      VALUES (?, ?, ?, 'schakt', '2026-08-01', ?)`).run(companyId, customerId, projectId, userId).lastInsertRowid;
    const vehicleId = db.prepare(`INSERT INTO vehicles (company_id, regnr, typ) VALUES (?, 'TKA412', 'tippbil')`).run(companyId).lastInsertRowid;
    db.prepare(`INSERT INTO job_assignments (company_id, job_id, vehicle_id, driver_id, datum, created_by_user_id)
      VALUES (?, ?, ?, ?, '2026-08-01', ?)`).run(companyId, jobId, vehicleId, recentWork, userId);
    db.prepare(`INSERT INTO driver_links (company_id, driver_id, token_hash, expires_at, created_at) VALUES (?, ?, 'h1', ?, ?)`)
      .run(companyId, gone, '2025-06-03T00:00:00Z', OLD);

    const [result] = runRetention({ db, config, now: NOW, logger: silentLogger });
    expect(result.drivers).toBe(1);
    const row = (id) => db.prepare('SELECT name, phone, active, anonymized_at FROM drivers WHERE id = ?').get(id);
    expect(row(gone)).toMatchObject({ name: `Raderad förare #${gone}`, phone: null, active: 0 });
    expect(row(gone).anonymized_at).toBeTruthy();
    expect(db.prepare('SELECT revoked_at FROM driver_links WHERE driver_id = ?').pluck().get(gone)).toBeTruthy();
    for (const id of [active, recentWork, newHire]) expect(row(id).anonymized_at).toBeNull();
    const audit = db.prepare(`SELECT entity_id, action, after_json FROM audit_log WHERE entity = 'driver'`).all();
    expect(audit).toEqual([{ entity_id: String(gone), action: 'retention_anonymize', after_json: JSON.stringify({ cutoff: '2025-10-05' }) }]);
    expect(audit[0].after_json).not.toContain('Gösta');
  });

  it('anonymizeDriver is a no-op for an already anonymised driver', () => {
    const { db, companyId, addDriver } = ctx;
    const id = addDriver('Gamle Gösta');
    expect(anonymizeDriver(db, { companyId, driverId: id })).toBe(true);
    expect(anonymizeDriver(db, { companyId, driverId: id })).toBe(false);
  });
});

describe('backup', () => {
  it('mirrors photos to BACKUP_DIR and drops the copies of photos removed by retention', () => {
    const { db, config, addPhoto } = ctx;
    const oldId = 'c'.repeat(32);
    const newId = 'd'.repeat(32);
    addPhoto(oldId, OLD);
    addPhoto(newId, RECENT);
    const mirrorPhotos = join(config.backupMirrorDir, 'photos');

    const target = runBackup({ db, config, logger: silentLogger });
    expect(existsSync(target)).toBe(true);
    expect(existsSync(join(config.backupMirrorDir, target.split(/[\\/]/).pop()))).toBe(true);
    expect(existsSync(photoPath(mirrorPhotos, oldId))).toBe(true);
    expect(existsSync(photoPath(mirrorPhotos, newId))).toBe(true);

    runRetention({ db, config, now: NOW, logger: silentLogger });
    runBackup({ db, config, logger: silentLogger });
    expect(existsSync(photoPath(mirrorPhotos, oldId))).toBe(false);
    expect(existsSync(photoPath(mirrorPhotos, newId))).toBe(true);
  });
});
