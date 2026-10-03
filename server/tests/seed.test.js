import { describe, it, expect } from 'vitest';
import { testDb } from './helpers.js';
import { seedDemo, demoWorkdays } from '../seed/demo.js';
import { normalizeOrgNr } from '../lib/normalize.js';
import { isoWeek } from '../lib/dates.js';

describe('demo seed', () => {
  const today = '2026-10-02'; // a Friday
  const db = testDb();
  const summary = seedDemo(db, { today, password: 'test' });
  const count = (sql) => db.prepare(sql).pluck().get();

  it('matches the spec: 5 vehicles, 4 drivers, 3 customers, 4 projects', () => {
    expect(count('SELECT COUNT(*) FROM vehicles')).toBe(5);
    expect(count('SELECT COUNT(*) FROM drivers')).toBe(4);
    expect(count('SELECT COUNT(*) FROM customers')).toBe(3);
    expect(count('SELECT COUNT(*) FROM projects')).toBe(4);
    expect(count('SELECT COUNT(*) FROM price_lists WHERE is_default = 1')).toBe(1);
  });

  it('uses valid, normalised org numbers', () => {
    for (const org of db.prepare('SELECT org_nr FROM customers UNION ALL SELECT org_nr FROM companies').pluck().all()) {
      expect(normalizeOrgNr(org)).toBe(org);
    }
  });

  it('covers two ISO weeks of weekday lass', () => {
    const weeks = new Set(db.prepare('SELECT DISTINCT datum FROM lass_current').pluck().all().map((d) => isoWeek(d).key));
    expect([...weeks].sort()).toEqual(['2026-W39', '2026-W40']);
    expect(summary.lass).toBeGreaterThan(100);
    expect(count('SELECT COUNT(*) FROM time_entries')).toBe(6);
  });

  it('includes the review, hazardous waste, correction and miljözon cases', () => {
    expect(count(`SELECT COUNT(*) FROM lass_current WHERE review_status = 'behover_granskas'`)).toBeGreaterThanOrEqual(3);
    expect(count(`SELECT COUNT(*) FROM lass_current WHERE farligt_avfall = 1 AND avfallskod = '170503'`)).toBe(1);
    expect(count(`SELECT COUNT(*) FROM lass_current WHERE version = 2 AND change_reason LIKE 'Vikt felavläst%'`)).toBe(1);
    expect(count('SELECT COUNT(*) FROM job_assignments WHERE miljozon_warning = 1 AND miljozon_ack_user_id IS NOT NULL')).toBe(1);
  });

  it('corrects the misread weight in version 2', () => {
    const [v1, v2] = db.prepare(`
      SELECT netto_kg FROM lass_versions WHERE lass_id = (
        SELECT lass_id FROM lass_versions WHERE change_reason LIKE 'Vikt felavläst%') ORDER BY version`).pluck().all();
    expect(v2).toBeGreaterThan(v1 * 5);
  });

  it('refuses to seed twice', () => {
    expect(() => seedDemo(db, { today, password: 'x' })).toThrow(/already contains data/);
  });

  it('only uses weekdays up to today', () => {
    const { days } = demoWorkdays('2026-09-28'); // Monday
    expect(days.at(-1)).toBe('2026-09-28');
    expect(days).toHaveLength(6);
  });
});
