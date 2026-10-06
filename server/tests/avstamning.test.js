import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { seedDemo, DEMO_EMAIL } from '../seed/demo.js';
import { ekbackaListText, skogsasListText } from '../seed/weighList.js';
import { stockholmDate } from '../lib/dates.js';
import { testConfig, testDb, silentLogger } from './helpers.js';

const TODAY = stockholmDate();
const PASSWORD = 'hemligt123';

let ctx;
beforeEach(async () => {
  const config = testConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')) });
  const db = testDb();
  const seeded = seedDemo(db, { today: TODAY, password: PASSWORD });
  const app = createApp({ config, db, logger: silentLogger });
  const token = (await request(app).post('/api/auth/login').send({ email: DEMO_EMAIL, password: PASSWORD })).body.token;
  const as = (m, url, t = token) => request(app)[m](url).set('Authorization', `Bearer ${t}`);
  const companyId = db.prepare('SELECT id FROM companies').pluck().get();
  const listId = seeded.weighList.listId;
  ctx = { app, db, as, companyId, listId, seeded, token };
});

const get = async () => (await ctx.as('get', `/api/avstamning/${ctx.listId}`)).body;
const byStatus = (r, s) => r.rows.filter((x) => x.status === s);

describe('the seeded Ekbacka list', () => {
  it('finds the unlogged loads, the weight difference and the load missing from the list', async () => {
    const r = await get();
    expect(r.list).toMatchObject({ facility_name: 'Ekbacka massmottagning', facility_orgnr: '559404-1236' });
    expect(r.totals.saknas).toBe(3);
    expect(r.totals.avvikelse).toBe(1);
    expect(r.totals.matchad).toBe(r.totals.rows - 4);
    expect(r.totals.weight_diff_kg).toBe(240);

    // The two Rörstrand loads: suggested on Mikael's assignment, priced on Norrbacka's contract (132 kr/t).
    const missing = byStatus(r, 'saknas');
    const ours = missing.filter((x) => x.regnr === 'TKA412');
    expect(ours).toHaveLength(2);
    for (const m of ours) {
      expect(m.suggestion).not.toBeNull();
      expect(m.options[0]).toMatchObject({ project_name: 'Kv. Rörstrand – schakt', regnr: 'TKA412' });
      expect(m.estimate).toMatchObject({ unit: 'ton', price_ore: 13200, amount_ore: Math.round((13200 * m.netto_kg) / 1000) });
    }
    expect(r.totals.saknas_value_ore).toBe(ours.reduce((s, m) => s + m.estimate.amount_ore, 0));

    // The hired truck has no assignment: the office has to pick the job.
    const hired = missing.find((x) => x.regnr === 'UEB551');
    expect(hired).toMatchObject({ suggestion: null, estimate: null, options: [] });
    expect(r.totals.saknas_unpriced).toBe(1);

    const diff = byStatus(r, 'avvikelse')[0];
    expect(diff.differences).toEqual([{ field: 'netto_kg', list: diff.netto_kg, lass: diff.netto_kg - 240 }]);
    expect(diff.fixable).toEqual(['netto_kg']);
    expect(diff.diff_value_ore).toBe(Math.round((13200 * diff.netto_kg) / 1000) - Math.round((13200 * (diff.netto_kg - 240)) / 1000));

    expect(r.unlisted).toHaveLength(1);
    expect(r.unlisted[0]).toMatchObject({ material: 'Blandat byggavfall', till_namn: 'Ekbacka massmottagning' });
  });

  it('appears in the list overview and the summary', async () => {
    const lists = (await ctx.as('get', '/api/avstamning')).body;
    expect(lists).toHaveLength(1);
    expect(lists[0].totals.saknas).toBe(3);
    const summary = (await ctx.as('get', '/api/avstamning/summary')).body;
    expect(summary).toMatchObject({ lists: 1, saknas: 3, avvikelse: 1 });
    expect(summary.saknas_value_ore).toBeGreaterThan(400000);
  });

  it('is scoped to the company', async () => {
    const other = ctx.db.prepare('INSERT INTO companies (name) VALUES (?)').run('Annat Åkeri AB').lastInsertRowid;
    ctx.db.prepare('INSERT INTO users (company_id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(other, 'Annan', 'annan@test.se', bcrypt.hashSync(PASSWORD, 4));
    const t = (await request(ctx.app).post('/api/auth/login').send({ email: 'annan@test.se', password: PASSWORD })).body.token;
    expect((await ctx.as('get', `/api/avstamning/${ctx.listId}`, t)).status).toBe(404);
    expect((await ctx.as('get', '/api/avstamning', t)).body).toEqual([]);
    expect((await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/1/ignore`, t).send({ reason: 'x' })).status).toBe(404);
  });
});

describe('creating a lass from a weighing', () => {
  it('logs it on the suggested job with the row as evidence, and the row becomes matched', async () => {
    const before = await get();
    const row = byStatus(before, 'saknas').find((x) => x.regnr === 'TKA412');
    const res = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${row.id}/lass`)
      .send({ job_id: row.suggestion.job_id, assignment_id: row.suggestion.assignment_id, avfallskod: '170504' });
    expect(res.status).toBe(201);
    const l = res.body.lass;
    expect(l).toMatchObject({
      datum: row.datum, tid: row.tid, vagsedel_nr: row.vagsedel_nr, netto_kg: row.netto_kg, vehicle_regnr: 'TKA412',
      till_namn: 'Ekbacka massmottagning', till_orgnr: '559404-1236', avfallskod: '170504', material: 'Schaktmassor',
      created_by_kind: 'office', photo_id: null,
    });
    // Every billing field is there and typed by the office; the list replaces the photo, so no review is needed.
    expect(l.review_reasons).toEqual([]);
    expect(l.review_status).toBe('ok');
    expect(l.review_reasons).toEqual([]);
    expect(ctx.db.prepare('SELECT weigh_list_row_id FROM lass WHERE id = ?').pluck().get(l.lass_id)).toBe(row.id);

    const after = await get();
    const now = after.rows.find((x) => x.id === row.id);
    expect(now).toMatchObject({ status: 'matchad', resolution: 'lass_skapad', match: { lass_id: l.lass_id, kind: 'skapad' } });
    expect(after.totals.saknas).toBe(2);

    // It is on the week's fakturaunderlag now.
    const audit = ctx.db.prepare(`SELECT action FROM audit_log WHERE entity = 'lass' AND entity_id = ?`).pluck().all(String(l.lass_id));
    expect(audit).toContain('create_from_weigh_list');

    // A second create for the same row is refused.
    const again = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${row.id}/lass`).send({ job_id: row.suggestion.job_id });
    expect(again.status).toBe(409);
  });

  it('lets the office pick the job for a hired truck; the other regnr is flagged for review', async () => {
    const r = await get();
    const hired = byStatus(r, 'saknas').find((x) => x.regnr === 'UEB551');
    const job = ctx.db.prepare(`SELECT j.id FROM jobs j JOIN projects p ON p.id = j.project_id WHERE p.name = 'Kv. Rörstrand – schakt'`).pluck().get();
    const assignment = ctx.db.prepare('SELECT id FROM job_assignments WHERE job_id = ? AND datum = ? ORDER BY id LIMIT 1').pluck().get(job, hired.datum);

    const suggest = (await ctx.as('get', `/api/avstamning/${ctx.listId}/rows/${hired.id}/suggest?job_id=${job}`)).body;
    expect(suggest).toMatchObject({ material: 'Schaktmassor', avfallskod: '170504', farligt_avfall: false });
    expect(suggest.estimate.amount_ore).toBe(Math.round((13200 * hired.netto_kg) / 1000));

    const res = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${hired.id}/lass`)
      .send({ job_id: job, assignment_id: assignment, avfallskod: suggest.avfallskod });
    expect(res.status).toBe(201);
    expect(res.body.lass.vehicle_regnr).toBe('UEB551');
    expect(res.body.lass.review_status).toBe('behover_granskas');
    expect(res.body.lass.review_reasons).toEqual(['Annat regnr på vågsedeln']);
  });

  it('validates the job and the assignment', async () => {
    const r = await get();
    const row = byStatus(r, 'saknas')[0];
    const bad = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${row.id}/lass`).send({ job_id: 99999 });
    expect(bad.status).toBe(400);
    const otherJobAssignment = ctx.db.prepare(`SELECT a.id FROM job_assignments a WHERE a.job_id != ? LIMIT 1`).pluck().get(row.suggestion?.job_id ?? 0);
    const wrong = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${row.id}/lass`)
      .send({ job_id: row.suggestion.job_id, assignment_id: otherJobAssignment });
    expect(wrong.status).toBe(400);
    const matched = byStatus(r, 'matchad')[0];
    const dup = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${matched.id}/lass`).send({ job_id: row.suggestion.job_id });
    expect(dup.status).toBe(409);
  });
});

describe('correcting from the list', () => {
  it('writes a new lass version with the scale weight and the reason', async () => {
    const r = await get();
    const diff = byStatus(r, 'avvikelse')[0];
    const res = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${diff.id}/fix`).send({ fields: ['netto_kg'] });
    expect(res.status).toBe(201);
    expect(res.body.lass.netto_kg).toBe(diff.netto_kg);
    expect(res.body.lass.change_reason).toBe(`Rättad enligt våglista från Ekbacka massmottagning (rad ${diff.line_no})`);
    const versions = ctx.db.prepare('SELECT netto_kg FROM lass_versions WHERE lass_id = ? ORDER BY version').pluck().all(diff.match.lass_id);
    expect(versions.at(-1)).toBe(diff.netto_kg);
    expect(versions.at(-2)).toBe(diff.netto_kg - 240);

    const after = await get();
    expect(after.rows.find((x) => x.id === diff.id).status).toBe('matchad');
    expect(after.totals.avvikelse).toBe(0);

    const again = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${diff.id}/fix`).send({ fields: ['netto_kg'] });
    expect(again.status).toBe(400);
  });

  it('refuses when the lass is already invoiced', async () => {
    const r = await get();
    const diff = byStatus(r, 'avvikelse')[0];
    const batch = ctx.db.prepare(`INSERT INTO invoice_batches (company_id, iso_week, customer_id, kind, status, external_ref, total_ore,
      vat_mode, lines_snapshot_json, created_by_user_id) VALUES (?, '2026-W01', 1, 'manuell', 'skapad', 'x', 0, 'normal', '[]', 1)`).run(ctx.companyId).lastInsertRowid;
    ctx.db.prepare(`INSERT INTO invoice_lines (batch_id, lass_id, lass_version, description, quantity, unit, price_ore, amount_ore)
      VALUES (?, ?, 1, 'x', 1, 'ton', 0, 0)`).run(batch, diff.match.lass_id);
    const after = await get();
    expect(after.rows.find((x) => x.id === diff.id)).toMatchObject({ status: 'avvikelse', fixable: [] });
    const res = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${diff.id}/fix`).send({ fields: ['netto_kg'] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invoiced');
  });
});

describe('ignoring a weighing', () => {
  it('needs a reason, can be undone, and only applies to weighings without a lass', async () => {
    const r = await get();
    const hired = byStatus(r, 'saknas').find((x) => x.regnr === 'UEB551');
    expect((await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${hired.id}/ignore`).send({ reason: ' ' })).status).toBe(400);
    const res = await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${hired.id}/ignore`).send({ reason: 'Underåkaren fakturerar själv' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ignorerad', resolution_note: 'Underåkaren fakturerar själv' });
    expect((await get()).totals).toMatchObject({ saknas: 2, ignorerad: 1 });

    const undo = await ctx.as('delete', `/api/avstamning/${ctx.listId}/rows/${hired.id}/ignore`);
    expect(undo.status).toBe(200);
    expect(undo.body.status).toBe('saknas');

    const matched = byStatus(r, 'matchad')[0];
    expect((await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${matched.id}/ignore`).send({ reason: 'x' })).status).toBe(409);
  });
});

describe('importing a list', () => {
  it('previews the Skogsås rows copied from Excel and imports them; prefix-less tickets still match', async () => {
    const text = skogsasListText(ctx.db, { companyId: ctx.companyId, week: ctx.seeded.previousWeek });
    const preview = await ctx.as('post', '/api/avstamning/preview').send({ text });
    expect(preview.status).toBe(200);
    expect(preview.body.error).toBeNull();
    expect(preview.body.mapping.unit).toBe('ton');
    expect(preview.body.mapping.columns).toMatchObject({ datum: 0, vagsedel_nr: 1, regnr: 2, material: 3, netto_kg: 4 });
    expect(preview.body.rows[0].tid).toMatch(/^\d\d:\d\d$/);

    const res = await ctx.as('post', '/api/avstamning').send({
      text, mapping: preview.body.mapping, facility_name: 'Skogsås återvinning', source_name: 'skogsas.txt',
    });
    expect(res.status).toBe(201);
    expect(res.body.totals.saknas).toBe(1);
    expect(res.body.totals.avvikelse).toBe(0);
    expect(res.body.totals.matchad).toBe(res.body.totals.rows - 1);
    expect(res.body.rows.filter((x) => x.match).every((x) => x.match.kind === 'vagsedel')).toBe(true);
    expect(res.body.unlisted).toEqual([]);
    // Täby is priced per ton on Norrbacka's contract.
    expect(res.body.rows.find((x) => x.status === 'saknas').estimate.unit).toBe('ton');
  });

  it('returns the columns for manual mapping when it can\'t map them itself', async () => {
    const res = await ctx.as('post', '/api/avstamning/preview').send({ text: 'A;B;C\n2026-09-29;ABC123;18420\n' });
    expect(res.status).toBe(200);
    expect(res.body.error).toMatch(/rubrikrad/);
    expect(res.body.headers).toEqual(['Kolumn 1', 'Kolumn 2', 'Kolumn 3']);
    const mapped = await ctx.as('post', '/api/avstamning/preview')
      .send({ text: 'A;B;C\n2026-09-29;ABC123;18420\n', mapping: { columns: { datum: 0, regnr: 1, netto_kg: 2 }, unit: 'kg' } });
    expect(mapped.body.error).toBeNull();
    // Without a header row, the first line is data too ("A" isn't a date).
    expect(mapped.body.row_count).toBe(1);
    expect(mapped.body.skipped_count).toBe(1);
  });

  it('rejects an empty list, future dates and a missing facility', async () => {
    expect((await ctx.as('post', '/api/avstamning/preview').send({ text: '' })).status).toBe(400);
    const future = 'Datum;Netto\n2099-01-01;18000\n';
    const mapping = { columns: { datum: 0, netto_kg: 1 }, unit: 'kg' };
    expect((await ctx.as('post', '/api/avstamning').send({ text: future, mapping, facility_name: 'X' })).status).toBe(400);
    expect((await ctx.as('post', '/api/avstamning').send({ text: 'Datum;Netto\n2026-09-29;18000\n', mapping })).status).toBe(400);
  });

  it('accepts lists larger than the default request limit', async () => {
    const text = ekbackaListText(ctx.db, { companyId: ctx.companyId, week: ctx.seeded.previousWeek });
    const padded = `${text}\r\n${'2026-09-29;12:00;;;Fyllnad;;\r\n'.repeat(12000)}`;
    expect(padded.length).toBeGreaterThan(300_000);
    const res = await ctx.as('post', '/api/avstamning/preview').send({ text: padded });
    expect(res.status).toBe(400); // too many rows, but not "request too large"
    expect(res.body.error.message).toMatch(/för många rader/);
  });

  it('refuses the large body without a login', async () => {
    const res = await request(ctx.app).post('/api/avstamning/preview').send({ text: 'x'.repeat(400_000) });
    expect(res.status).toBe(401);
  });
});

describe('deleting and exporting', () => {
  it('exports the reconciliation as CSV', async () => {
    const res = await ctx.as('get', `/api/avstamning/${ctx.listId}/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/avstamning-ekbacka-massmottagning-/);
    const lines = res.text.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Rad;Datum;Tid;Vågsedel/);
    expect(lines.filter((l) => l.includes(';Saknas i Åkaren;'))).toHaveLength(3);
    expect(lines.filter((l) => l.includes(';Inte på våglistan;'))).toHaveLength(1);
  });

  it('deletes a list unless lass were created from it', async () => {
    const r = await get();
    const row = byStatus(r, 'saknas').find((x) => x.suggestion);
    await ctx.as('post', `/api/avstamning/${ctx.listId}/rows/${row.id}/lass`).send({ job_id: row.suggestion.job_id });
    expect((await ctx.as('delete', `/api/avstamning/${ctx.listId}`)).status).toBe(409);

    const text = skogsasListText(ctx.db, { companyId: ctx.companyId, week: ctx.seeded.previousWeek });
    const preview = (await ctx.as('post', '/api/avstamning/preview').send({ text })).body;
    const created = (await ctx.as('post', '/api/avstamning').send({ text, mapping: preview.mapping, facility_name: 'Skogsås återvinning' })).body;
    expect((await ctx.as('delete', `/api/avstamning/${created.list.id}`)).status).toBe(204);
    expect(ctx.db.prepare('SELECT COUNT(*) FROM weigh_list_rows WHERE weigh_list_id = ?').pluck().get(created.list.id)).toBe(0);
  });
});
