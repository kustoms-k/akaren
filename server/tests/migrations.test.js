import { describe, it, expect } from 'vitest';
import { openDb, migrate } from '../db/index.js';
import { testDb, addCompanyWithUser } from './helpers.js';

function seedLass(db) {
  const { companyId, userId } = addCompanyWithUser(db);
  const customerId = db.prepare('INSERT INTO customers (company_id, name) VALUES (?, ?)').run(companyId, 'Kund AB').lastInsertRowid;
  const projectId = db.prepare('INSERT INTO projects (company_id, customer_id, name) VALUES (?, ?, ?)').run(companyId, customerId, 'P1').lastInsertRowid;
  const jobId = db.prepare(`INSERT INTO jobs (company_id, customer_id, project_id, uppdragstyp, datum_fran, created_by_user_id)
    VALUES (?, ?, ?, 'schakt', '2026-09-28', ?)`).run(companyId, customerId, projectId, userId).lastInsertRowid;
  const lassId = db.prepare('INSERT INTO lass (company_id, job_id) VALUES (?, ?)').run(companyId, jobId).lastInsertRowid;
  const insertVersion = db.prepare(`INSERT INTO lass_versions (lass_id, version, customer_id, project_id, datum, netto_kg,
      review_status, change_reason, created_by_kind) VALUES (?, ?, ?, ?, '2026-09-28', ?, ?, ?, 'office')`);
  insertVersion.run(lassId, 1, customerId, projectId, 18400, 'ok', null);
  return { companyId, userId, customerId, projectId, jobId, lassId, insertVersion };
}

describe('migrations', () => {
  it('apply cleanly and are idempotent', () => {
    const db = openDb(':memory:');
    expect(migrate(db)).toEqual(['001_init']);
    expect(migrate(db)).toEqual([]);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).pluck().all();
    for (const t of ['companies', 'users', 'customers', 'projects', 'vehicles', 'drivers', 'jobs', 'job_assignments',
      'driver_links', 'lass', 'lass_versions', 'time_entries', 'invoice_batches', 'invoice_lines', 'audit_log']) {
      expect(tables).toContain(t);
    }
  });

  it('enforce foreign keys', () => {
    const db = testDb();
    expect(() => db.prepare('INSERT INTO projects (company_id, customer_id, name) VALUES (1, 999, ?)').run('x')).toThrow(/FOREIGN KEY/);
  });
});

describe('lass versions', () => {
  it('are append-only', () => {
    const db = testDb();
    const { lassId } = seedLass(db);
    expect(() => db.prepare('UPDATE lass_versions SET netto_kg = 1 WHERE lass_id = ?').run(lassId))
      .toThrow(/append-only/);
  });

  it('require a change reason after version 1', () => {
    const db = testDb();
    const { lassId, customerId, projectId, insertVersion } = seedLass(db);
    expect(() => insertVersion.run(lassId, 2, customerId, projectId, 18000, 'granskad', null)).toThrow(/CHECK/);
    expect(() => insertVersion.run(lassId, 2, customerId, projectId, 18000, 'granskad', '  ')).toThrow(/CHECK/);
    insertVersion.run(lassId, 2, customerId, projectId, 18000, 'granskad', 'Rättad mot vågsedel');
  });

  it('lass_current exposes the newest version with corrected_at', () => {
    const db = testDb();
    const { lassId, customerId, projectId, insertVersion } = seedLass(db);
    insertVersion.run(lassId, 2, customerId, projectId, 18000, 'granskad', 'Rättad');
    const rows = db.prepare('SELECT * FROM lass_current WHERE lass_id = ?').all(lassId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 2, netto_kg: 18000, review_status: 'granskad' });
    expect(rows[0].corrected_at).toBeTruthy();
  });

  it('reject a malformed avfallskod', () => {
    const db = testDb();
    const { lassId, customerId, projectId } = seedLass(db);
    expect(() => db.prepare(`INSERT INTO lass_versions (lass_id, version, customer_id, project_id, datum, avfallskod,
      review_status, change_reason, created_by_kind) VALUES (?, 2, ?, ?, '2026-09-28', '17 05 04', 'ok', 'x', 'office')`)
      .run(lassId, customerId, projectId)).toThrow(/CHECK/);
  });
});

describe('invoice lines', () => {
  it('never put the same lass on two live invoice lines', () => {
    const db = testDb();
    const { companyId, userId, customerId, lassId } = seedLass(db);
    const batch = db.prepare(`INSERT INTO invoice_batches (company_id, iso_week, customer_id, kind, status, external_ref,
      total_ore, vat_mode, lines_snapshot_json, created_by_user_id) VALUES (?, '2026-W40', ?, 'manuell', 'skapad', ?, 0, 'normal', '[]', ?)`);
    const b1 = batch.run(companyId, customerId, 'ref-1', userId).lastInsertRowid;
    const b2 = batch.run(companyId, customerId, 'ref-2', userId).lastInsertRowid;
    const line = db.prepare(`INSERT INTO invoice_lines (batch_id, lass_id, lass_version, description, quantity, unit, price_ore, amount_ore)
      VALUES (?, ?, 1, 'x', 1, 'st', 100, 100)`);
    line.run(b1, lassId);
    expect(() => line.run(b2, lassId)).toThrow(/UNIQUE/);

    // Voiding the first batch releases the lass.
    db.prepare('DELETE FROM invoice_lines WHERE batch_id = ?').run(b1);
    line.run(b2, lassId);
  });
});
