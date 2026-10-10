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

describe('the full demo company (DEMO_FULL)', () => {
  it('is a whole åkeri with a month of history: invoiced weeks, reconciled lists and reported hazardous waste', async () => {
    const { createApp } = await import('../app.js');
    const { seedDemo: seed, DEMO_EMAIL } = await import('../seed/demo.js');
    const { testConfig, testDb: freshDb, silentLogger } = await import('./helpers.js');
    const { stockholmDate } = await import('../lib/dates.js');
    const request = (await import('supertest')).default;
    const db = freshDb();
    const s = seed(db, { today: stockholmDate(), password: 'hemligt123', full: true });
    expect(s).toMatchObject({ vehicles: 14, drivers: 13, customers: 7, projects: 10 });
    expect(s.full.invoiced.batches).toBeGreaterThanOrEqual(16);
    expect(s.full.found).toEqual({ lists: 3, created: 3, corrected: 3 });

    const app = createApp({ config: testConfig(), db, logger: silentLogger });
    const token = (await request(app).post('/api/auth/login').send({ email: DEMO_EMAIL, password: 'hemligt123' })).body.token;
    const get = async (url) => (await request(app).get(url).set('Authorization', `Bearer ${token}`)).body;

    // Both history weeks went out in full; last week is ready to invoice, nothing blocked (demo step 7).
    for (const week of s.full.history_weeks) {
      const u = await get(`/api/fakturaunderlag?week=${week}`);
      expect(u.groups.length).toBeGreaterThanOrEqual(8);
      expect(u.groups.every((g) => g.status === 'fakturerad')).toBe(true);
    }
    const prev = await get(`/api/fakturaunderlag?week=${s.previousWeek}`);
    expect(prev.totals.blocked).toBe(0);
    expect(prev.totals.invoiced).toBe(0);
    expect(prev.totals.ready).toBe(prev.groups.length);

    // Hittat av Lasskoll already has a history, all of it invoiced; the base Ekbacka list still has its three.
    const found = await get('/api/avstamning/found');
    expect(found.totals).toMatchObject({ lass: 3, weight_up: 3 });
    expect(found.totals.value_ore).toBeGreaterThan(500000);
    expect(found.items.filter((i) => i.kind === 'lass').every((i) => i.invoiced)).toBe(true);
    const summary = await get('/api/avstamning/summary');
    expect(summary).toMatchObject({ lists: 4, saknas: 3, avvikelse: 1 });

    // History hazardous waste is reported; only the base week's load is waiting.
    const hazards = await get('/api/lass/farligt-avfall');
    expect(hazards).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) FROM hazard_reports').pluck().get()).toBe(2);
  });
});
