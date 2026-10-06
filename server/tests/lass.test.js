import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { createLassService } from '../services/lass.js';
import { seedDemo, DEMO_EMAIL } from '../seed/demo.js';
import { stockholmDate, addDays } from '../lib/dates.js';
import { addWorkdays } from '../lib/workdays.js';
import { testConfig, testDb, silentLogger } from './helpers.js';

const TODAY = stockholmDate();
const PASSWORD = 'hemligt123';

let ctx;
beforeEach(async () => {
  const config = testConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')) });
  const db = testDb();
  seedDemo(db, { today: TODAY, password: PASSWORD });
  const app = createApp({ config, db, logger: silentLogger });
  const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.token;
  const token = await login(DEMO_EMAIL);
  const as = (m, url, t = token) => request(app)[m](url).set('Authorization', `Bearer ${t}`);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  ctx = { app, db, as, one, login };
});

const pending = () => ctx.as('get', '/api/lass?review=behover_granskas');

describe('review queue', () => {
  it('lists lass that need review, oldest first, with reasons and names', async () => {
    const res = await pending();
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    const keys = res.body.map((l) => `${l.datum} ${l.tid} ${String(l.id).padStart(6, '0')}`);
    expect(keys).toEqual([...keys].sort());
    for (const l of res.body) {
      expect(l.review_status).toBe('behover_granskas');
      expect(l.review_reasons.length).toBeGreaterThan(0);
      expect(l.customer_name).toBeTruthy();
      expect(l.project_name).toBeTruthy();
    }
  });

  it('filters by project, hazardous waste and ticket number', async () => {
    const all = (await ctx.as('get', '/api/lass')).body;
    const projectId = all[0].project_id;
    const byProject = (await ctx.as('get', `/api/lass?project_id=${projectId}`)).body;
    expect(byProject.length).toBeGreaterThan(0);
    expect(byProject.every((l) => l.project_id === projectId)).toBe(true);

    const hazard = (await ctx.as('get', '/api/lass?farligt=1')).body;
    expect(hazard).toHaveLength(1);
    expect(hazard[0]).toMatchObject({ farligt_avfall: true, avfallskod: '170503' });

    const byTicket = (await ctx.as('get', `/api/lass?q=${encodeURIComponent(hazard[0].vagsedel_nr)}`)).body;
    expect(byTicket.map((l) => l.id)).toEqual([hazard[0].id]);
  });

  it('counts what needs attention', async () => {
    const res = await ctx.as('get', '/api/lass/summary');
    expect(res.body.to_review).toBe((await pending()).body.length);
    expect(res.body.hazard_unreported).toBe(1);
  });
});

describe('one lass', () => {
  it('returns the current version, every version with who made it, and the job context', async () => {
    const corrected = ctx.one(`SELECT lass_id FROM lass_versions WHERE version = 2 AND change_reason LIKE 'Vikt felavläst%'`).lass_id;
    const res = await ctx.as('get', `/api/lass/${corrected}`);
    expect(res.status).toBe(200);
    expect(res.body.lass).toMatchObject({ lass_id: corrected, version: 2, review_status: 'granskad' });
    expect(res.body.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(res.body.versions[0].driver_name).toBe('Mikael Lund');
    expect(res.body.versions[1]).toMatchObject({ created_by_kind: 'office', user_name: 'Kontoret' });
    expect(res.body.context).toMatchObject({ project_name: 'Kv. Rörstrand – schakt', assigned_regnr: 'TKA412' });
    expect(res.body.invoiced).toBe(false);
    expect(res.body.hazard).toBeNull();
  });

  it('is scoped to the company', async () => {
    const otherCompany = ctx.db.prepare('INSERT INTO companies (name) VALUES (?)').run('Annat Åkeri AB').lastInsertRowid;
    ctx.db.prepare('INSERT INTO users (company_id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(otherCompany, 'Annan', 'annan@test.se', bcrypt.hashSync(PASSWORD, 4));
    const other = await ctx.login('annan@test.se');
    const id = (await pending()).body[0].id;
    expect((await ctx.as('get', `/api/lass/${id}`, other)).status).toBe(404);
    expect((await ctx.as('post', `/api/lass/${id}/review`, other).send({})).status).toBe(404);
    expect((await ctx.as('get', '/api/lass', other)).body).toEqual([]);
  });
});

describe('office review', () => {
  it('approves with a new version and never changes the earlier one', async () => {
    const [first, second] = (await pending()).body;
    const v1Before = ctx.one('SELECT * FROM lass_versions WHERE lass_id = ? AND version = 1', first.id);

    const res = await ctx.as('post', `/api/lass/${first.id}/review`).send({});
    expect(res.status).toBe(201);
    expect(res.body.lass).toMatchObject({ version: first.version + 1, review_status: 'granskad', review_reasons: [], change_reason: 'Granskad av kontoret', created_by_kind: 'office' });
    expect(res.body.next_review_id).toBe(second.id);
    // Uncertain values the office looked at now count as checked by a person.
    expect(Object.values(res.body.lass.field_confidence)).not.toContain('lag');

    expect(ctx.one('SELECT * FROM lass_versions WHERE lass_id = ? AND version = 1', first.id)).toEqual(v1Before);
    expect(ctx.one('SELECT COUNT(*) AS n FROM lass_versions WHERE lass_id = ?', first.id).n).toBe(first.version + 1);
    expect((await ctx.as('post', `/api/lass/${first.id}/review`).send({})).status).toBe(409);
    expect(ctx.one(`SELECT action FROM audit_log WHERE entity = 'lass' AND entity_id = ? ORDER BY id DESC`, String(first.id)).action).toBe('review');
  });

  it('requires a reason when the office changes a value while approving', async () => {
    const l = (await pending()).body.find((x) => x.netto_kg != null);
    const noReason = await ctx.as('post', `/api/lass/${l.id}/review`).send({ fields: { netto_kg: l.netto_kg + 100 } });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.fields.change_reason).toBeTruthy();

    const ok = await ctx.as('post', `/api/lass/${l.id}/review`)
      .send({ fields: { netto_kg: l.netto_kg + 100 }, change_reason: 'Rättad mot vågsedel' });
    expect(ok.status).toBe(201);
    expect(ok.body.lass).toMatchObject({ netto_kg: l.netto_kg + 100, change_reason: 'Rättad mot vågsedel', review_status: 'granskad' });
    expect(ok.body.lass.field_confidence.netto_kg).toBe('kontor');
    // Untouched values are kept.
    expect(ok.body.lass).toMatchObject({ vagsedel_nr: l.vagsedel_nr, material: l.material, datum: l.datum });
  });

  it('rejects future dates', async () => {
    const l = (await pending()).body[0];
    const res = await ctx.as('post', `/api/lass/${l.id}/review`).send({ fields: { datum: addDays(TODAY, 1) }, change_reason: 'x' });
    expect(res.status).toBe(400);
  });

  it('refuses to change a lass that is on an invoice', async () => {
    const l = (await pending()).body[0];
    const { db } = ctx;
    const companyId = ctx.one('SELECT id FROM companies').id;
    const userId = ctx.one('SELECT id FROM users').id;
    const batch = db.prepare(`INSERT INTO invoice_batches (company_id, iso_week, customer_id, kind, status, external_ref, total_ore,
      vat_mode, lines_snapshot_json, created_by_user_id) VALUES (?, '2026-W40', ?, 'manuell', 'skapad', 'ref-x', 0, 'normal', '[]', ?)`)
      .run(companyId, l.customer_id, userId).lastInsertRowid;
    db.prepare(`INSERT INTO invoice_lines (batch_id, lass_id, lass_version, description, quantity, unit, price_ore, amount_ore)
      VALUES (?, ?, ?, 'x', 1, 'st', 0, 0)`).run(batch, l.id, l.version);
    expect((await ctx.as('get', `/api/lass/${l.id}`)).body.invoiced).toBe(true);
    const res = await ctx.as('post', `/api/lass/${l.id}/review`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invoiced');
  });
});

describe('office correction', () => {
  it('requires a reason and a real change, and keeps a reviewed lass reviewed', async () => {
    const reviewed = ctx.one(`SELECT lass_id, netto_kg FROM lass_current WHERE review_status = 'granskad' LIMIT 1`);
    expect((await ctx.as('post', `/api/lass/${reviewed.lass_id}/versions`).send({ fields: { netto_kg: 15000 } })).status).toBe(400);
    const same = await ctx.as('post', `/api/lass/${reviewed.lass_id}/versions`).send({ fields: { netto_kg: reviewed.netto_kg }, change_reason: 'x' });
    expect(same.status).toBe(400);
    expect(same.body.error.message).toBe('Inget har ändrats.');

    const res = await ctx.as('post', `/api/lass/${reviewed.lass_id}/versions`).send({ fields: { netto_kg: 15000 }, change_reason: 'Kunden ifrågasatte vikten' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ netto_kg: 15000, review_status: 'granskad' });
  });

  it('keeps the other-truck flag when a lass is corrected', () => {
    const { db } = ctx;
    const ref = ctx.one(`SELECT l.company_id, l.job_id, j.customer_id, j.project_id FROM lass l JOIN jobs j ON j.id = l.job_id LIMIT 1`);
    const service = createLassService({ db });
    const values = { vagsedel_nr: 'X-1', datum: TODAY, netto_kg: 18000, material: 'Schaktmassor', farligt_avfall: false };
    const { lass } = service.create({
      companyId: ref.company_id, jobId: ref.job_id, customerId: ref.customer_id, projectId: ref.project_id,
      vehicleRegnr: 'TKA412', values, photoId: null, regnrMismatch: true,
      confidence: { vagsedel_nr: 'hog', datum: 'hog', netto_kg: 'hog', material: 'hog' }, createdByKind: 'driver',
    });
    expect(lass.review_reasons).toContain('Annat regnr på vågsedeln');
    const corrected = service.addVersion({
      lassId: lass.lass_id, companyId: ref.company_id, patch: { netto_kg: 18100 }, changeReason: 'Rättad', personKind: 'forare', createdByKind: 'driver',
    });
    expect(corrected.review_status).toBe('behover_granskas');
    expect(corrected.review_reasons).toContain('Annat regnr på vågsedeln');
  });
});

describe('manual office entry', () => {
  it('creates a lass without a photo that goes to review', async () => {
    const assignment = ctx.one(`SELECT a.id, a.job_id FROM job_assignments a JOIN vehicles v ON v.id = a.vehicle_id WHERE v.regnr = 'TKA412' LIMIT 1`);
    const res = await ctx.as('post', '/api/lass').send({
      job_id: assignment.job_id, assignment_id: assignment.id,
      fields: { vagsedel_nr: 'EKB999001', datum: TODAY, tid: '15:40', material: 'Schaktmassor', netto_kg: 17820, till_namn: 'Ekbacka massmottagning' },
      note: 'Pappersvågsedel inlämnad på kontoret',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vehicle_regnr: 'TKA412', created_by_kind: 'office', review_status: 'behover_granskas', version: 1 });
    expect(res.body.review_reasons).toEqual(['Inget foto på vågsedeln']);
    expect(res.body.field_confidence).toMatchObject({ vagsedel_nr: 'kontor', netto_kg: 'kontor', avfallskod: 'saknas' });
  });

  it('validates the job, the assignment and the date', async () => {
    const jobs = ctx.db.prepare('SELECT id FROM jobs ORDER BY id').pluck().all();
    const otherJobAssignment = ctx.one('SELECT id FROM job_assignments WHERE job_id = ?', jobs[1]).id;
    const fields = { datum: TODAY, netto_kg: 17000 };
    expect((await ctx.as('post', '/api/lass').send({ job_id: 99999, fields })).status).toBe(400);
    expect((await ctx.as('post', '/api/lass').send({ job_id: jobs[0], assignment_id: otherJobAssignment, fields })).status).toBe(400);
    expect((await ctx.as('post', '/api/lass').send({ job_id: jobs[0], fields: { ...fields, datum: addDays(TODAY, 2) } })).status).toBe(400);
    expect((await ctx.as('post', '/api/lass').send({ job_id: jobs[0], fields: { ...fields, extra: 1 } })).status).toBe(400);
  });
});

describe('hazardous waste reporting', () => {
  it('shows the two-working-day deadline until the report is recorded', async () => {
    const [h] = (await ctx.as('get', '/api/lass/farligt-avfall')).body;
    expect(h).toMatchObject({ avfallskod: '170503', deadline: addWorkdays(h.datum, 2), reported_on: null });
    expect(['kommande', 'idag', 'forsenad']).toContain(h.state);

    const detail = (await ctx.as('get', `/api/lass/${h.id}`)).body;
    expect(detail.hazard).toMatchObject({ deadline: h.deadline, report: null });

    const reported = await ctx.as('post', `/api/lass/${h.id}/hazard-report`).send({ reference: 'AR-2026-118' });
    expect(reported.status).toBe(201);
    expect(reported.body).toMatchObject({ state: 'rapporterad', report: { reported_on: TODAY, reference: 'AR-2026-118', reported_by_name: 'Kontoret' } });
    expect((await ctx.as('post', `/api/lass/${h.id}/hazard-report`).send({})).status).toBe(409);
    expect((await ctx.as('get', '/api/lass/farligt-avfall')).body).toEqual([]);
    expect((await ctx.as('get', '/api/lass/farligt-avfall?all=1')).body[0]).toMatchObject({ id: h.id, state: 'rapporterad' });
    expect((await ctx.as('get', '/api/lass/summary')).body.hazard_unreported).toBe(0);

    // Undo keeps the record and lists the lass again.
    expect((await ctx.as('delete', `/api/lass/${h.id}/hazard-report`)).status).toBe(200);
    expect((await ctx.as('get', '/api/lass/farligt-avfall')).body.map((x) => x.id)).toEqual([h.id]);
    expect(ctx.one('SELECT COUNT(*) AS n FROM hazard_reports WHERE lass_id = ? AND withdrawn_at IS NOT NULL', h.id).n).toBe(1);
  });

  it('only applies to hazardous lass and rejects impossible dates', async () => {
    const plain = ctx.one('SELECT lass_id FROM lass_current WHERE farligt_avfall = 0 LIMIT 1').lass_id;
    expect((await ctx.as('post', `/api/lass/${plain}/hazard-report`).send({})).status).toBe(409);
    const [h] = (await ctx.as('get', '/api/lass/farligt-avfall')).body;
    expect((await ctx.as('post', `/api/lass/${h.id}/hazard-report`).send({ reported_on: addDays(TODAY, 1) })).status).toBe(400);
    expect((await ctx.as('post', `/api/lass/${h.id}/hazard-report`).send({ reported_on: addDays(h.datum, -1) })).status).toBe(400);
  });
});

describe('massredovisning', () => {
  const project = () => ctx.one(`SELECT id FROM projects WHERE name = 'Täby Park etapp 3 – VA-schakt'`).id;

  it('returns every lass of the project with totals and a destination breakdown', async () => {
    const id = project();
    const res = await ctx.as('get', `/api/massredovisning?project_id=${id}`);
    expect(res.status).toBe(200);
    const count = ctx.one('SELECT COUNT(*) AS n FROM lass_current WHERE project_id = ?', id).n;
    expect(res.body.rows).toHaveLength(count);
    expect(res.body.project).toMatchObject({ name: 'Täby Park etapp 3 – VA-schakt', customer_ref: 'NMA-2604', customer_name: 'Norrbacka Mark & Anläggning AB' });
    expect(res.body.totals.count).toBe(count);
    expect(res.body.totals.farligt_avfall).toBe(1);
    expect(res.body.totals.netto_kg).toBe(res.body.rows.reduce((s, r) => s + (r.netto_kg ?? 0), 0));
    expect(res.body.summary.map((g) => g.till_namn)).toEqual(expect.arrayContaining(['Skogsås återvinning', 'Ekbacka massmottagning']));
  });

  it('filters by date range', async () => {
    const id = project();
    const res = await ctx.as('get', `/api/massredovisning?project_id=${id}&from=${TODAY}&to=${TODAY}`);
    expect(res.body.rows.every((r) => r.datum === TODAY)).toBe(true);
    expect((await ctx.as('get', `/api/massredovisning?project_id=${id}&from=${TODAY}&to=${addDays(TODAY, -1)}`)).status).toBe(400);
    expect((await ctx.as('get', `/api/massredovisning?project_id=${id}&from=2026-13-01`)).status).toBe(400);
  });

  it('exports CSV for Swedish Excel', async () => {
    const res = await ctx.as('get', `/api/massredovisning?project_id=${project()}&format=csv`).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks).toString('utf8')));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="massredovisning-taby-park-etapp-3-va-schakt-start-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.body.startsWith('﻿Datum;Tid;Vågsedel;')).toBe(true);
    expect(res.body).toMatch(/;Ja;\d+,\d{3};/);
  });

  it('needs a project of the company', async () => {
    expect((await ctx.as('get', '/api/massredovisning')).status).toBe(400);
    expect((await ctx.as('get', '/api/massredovisning?project_id=99999')).status).toBe(404);
  });
});
