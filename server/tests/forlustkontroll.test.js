import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { seedDemo, DEMO_EMAIL } from '../seed/demo.js';
import { ekbackaListText, invoiceSpecText } from '../seed/weighList.js';
import { stockholmDate } from '../lib/dates.js';
import { parseWeighList } from '../lib/weighList.js';
import { chosenPrice, lossCheck, ticketInText } from '../lib/lossCheck.js';
import { testConfig, testDb, silentLogger } from './helpers.js';

const TODAY = stockholmDate();
const PASSWORD = 'hemligt123';
const EKBACKA = { name: 'Ekbacka massmottagning', orgnr: '559404-1236' };

describe('ticketInText', () => {
  it('finds the ticket in an invoice description, not dates or org numbers', () => {
    expect(ticketInText('EKB418297 5/10 Schaktmassor')).toBe('EKB418297');
    expect(ticketInText('Lass SK-77165 Täby')).toBe('SK-77165');
    expect(ticketInText('Vågsedel 418297, 20261005')).toBe('418297');
    expect(ticketInText('Norrbacka 559101-2348, vecka 40')).toBeNull();
    expect(ticketInText(null, 'Kvitto 77104')).toBe('77104');
  });
});

describe('chosenPrice', () => {
  const rows = [{ netto_kg: 18000, belopp_ore: 237600 }, { netto_kg: 12000, belopp_ore: 158400 }];
  it('derives the price per tonne from the invoices, or takes what the office typed', () => {
    expect(chosenPrice(rows)).toEqual({ unit: 'ton', ore: 13200, source: 'fakturor' });
    expect(chosenPrice(rows, { priceTonOre: 15000 })).toEqual({ unit: 'ton', ore: 15000, source: 'angivet' });
    expect(chosenPrice([{ belopp_ore: 245000 }, { belopp_ore: 250000 }, { belopp_ore: 245000 }])).toEqual({ unit: 'lass', ore: 245000, source: 'fakturor' });
    expect(chosenPrice([])).toBeNull();
  });
});

describe('lossCheck', () => {
  const weigh = [
    { line: 2, datum: '2026-09-28', tid: '07:12', vagsedel_nr: 'EKB418233', regnr: 'TKA412', netto_kg: 18420 },
    { line: 3, datum: '2026-09-28', tid: '08:31', vagsedel_nr: 'EKB418236', regnr: 'TKA412', netto_kg: 17960 },
    { line: 4, datum: '2026-09-29', tid: '07:05', vagsedel_nr: 'EKB418301', regnr: 'TKA412', netto_kg: 16540 },
  ];
  const invoice = [
    // Ticket in the description, invoice dated a week later, weight 240 kg lower than the scale.
    { line: 2, datum: '2026-10-05', material: 'EKB418233 28/9 Schaktmassor', netto_kg: 18180, belopp_ore: 239976 },
    { line: 3, datum: '2026-10-05', material: 'EKB418236 28/9 Schaktmassor', netto_kg: 17960, belopp_ore: 237072 },
  ];

  it('finds the weighing that was never invoiced and the weight that was under-billed, with their value', () => {
    const r = lossCheck({ weighRows: weigh, invoiceRows: invoice, facility: EKBACKA });
    expect(r.price).toEqual({ unit: 'ton', ore: 13200, source: 'fakturor' });
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]).toMatchObject({ vagsedel_nr: 'EKB418301', netto_kg: 16540, value_ore: Math.round(13200 * 16.54) });
    expect(r.differences).toEqual([expect.objectContaining({ vagsedel_nr: 'EKB418233', weighed_kg: 18420, invoiced_kg: 18180, diff_kg: 240, value_ore: 3168 })]);
    expect(r.totals).toMatchObject({ weighed: 3, matched: 2, missing: 1, missing_kg: 16540, diff_kg: 240, invoice_rows_unmatched: 0 });
    expect(r.totals.total_value_ore).toBe(r.totals.missing_value_ore + 3168);
    // The invoice rows count in the week of the load, not the invoice date.
    expect(r.weeks).toEqual([expect.objectContaining({ week: '2026-W40', weighed: 3, invoiced: 2, missing: 1 })]);
  });

  it('values missing loads per load when the invoices have no weights', () => {
    const perLoad = invoice.map(({ netto_kg: _, ...r }) => ({ ...r, belopp_ore: 245000 }));
    const r = lossCheck({ weighRows: weigh, invoiceRows: perLoad, facility: EKBACKA });
    expect(r.price.unit).toBe('lass');
    expect(r.missing[0].value_ore).toBe(245000);
    expect(r.differences).toEqual([]);
  });
});

describe('Förlustkontroll API and demo tools', () => {
  let ctx;
  beforeEach(async () => {
    const config = testConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')), DEMO_MODE: '1' });
    const db = testDb();
    const seeded = seedDemo(db, { today: TODAY, password: PASSWORD });
    const app = createApp({ config, db, logger: silentLogger });
    const token = (await request(app).post('/api/auth/login').send({ email: DEMO_EMAIL, password: PASSWORD })).body.token;
    const as = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${token}`);
    const companyId = db.prepare('SELECT id FROM companies').pluck().get();
    ctx = { app, db, as, config, seeded, companyId };
  });

  it('parses the demo invoice specification as invoices', () => {
    const text = invoiceSpecText(ctx.db, { companyId: ctx.companyId, week: ctx.seeded.previousWeek });
    const p = parseWeighList(text, null, { kind: 'faktura' });
    expect(p.mapping.columns).toMatchObject({ datum: 1, referens: 2, material: 3, netto_kg: 4, belopp: 7 });
    expect(p.mapping.unit).toBe('ton');
    expect(p.rows[0].belopp_ore).toBeGreaterThan(100000);
  });

  it('runs the check on the example files: the forgotten load, the never-logged ones and the 240 kg', async () => {
    const ex = (await ctx.as('get', '/api/demo/forlustkontroll-exempel')).body;
    const pw = (await ctx.as('post', '/api/forlustkontroll/preview').send({ text: ex.vaglista.text, kind: 'vaglista' })).body;
    const pf = (await ctx.as('post', '/api/forlustkontroll/preview').send({ text: ex.faktura.text, kind: 'faktura' })).body;
    expect(pw.error).toBeNull();
    expect(pf.error).toBeNull();
    const res = await ctx.as('post', '/api/forlustkontroll').send({
      weigh: { text: ex.vaglista.text, mapping: pw.mapping }, invoice: { text: ex.faktura.text, mapping: pf.mapping },
      facility_name: ex.facility_name, prospect_name: 'Teståkeriet AB',
    });
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.price).toEqual({ unit: 'ton', ore: 13200, source: 'fakturor' });
    expect(r.totals.missing).toBe(4);            // one forgotten slip + two never logged + the hired truck
    expect(r.missing.map((m) => m.regnr).sort()).toEqual(['TKA412', 'TKA412', 'TKA412', 'UEB551']);
    expect(r.totals.diff_kg).toBe(240);
    expect(r.totals.total_value_ore).toBeGreaterThan(800000);
    expect(r.totals.matched_by_ticket).toBe(r.totals.matched);
    // Nothing is stored; only the counts are audited.
    const audit = ctx.db.prepare(`SELECT after_json FROM audit_log WHERE entity = 'loss_check'`).pluck().get();
    expect(JSON.parse(audit)).toEqual({ weighed: r.totals.weighed, invoice_rows: r.totals.invoice_rows, missing: 4, value_ore: r.totals.total_value_ore });
  });

  it('explains which file is wrong', async () => {
    const res = await ctx.as('post', '/api/forlustkontroll').send({
      weigh: { text: 'Datum;Netto\n2026-09-29;18000\n', mapping: { columns: { datum: 0, netto_kg: 1 }, unit: 'kg' } },
      invoice: { text: 'Fakturadatum;Kund\n2026-10-05;X\n', mapping: { columns: { datum: 0 }, unit: 'kg' } },
      facility_name: 'Ekbacka',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/^Fakturaspecifikationen:/);
  });

  it('resets the demo database to fresh data, with photos', async () => {
    ctx.db.prepare(`INSERT INTO customers (company_id, name) VALUES (?, 'Extra kund')`).run(ctx.companyId);
    expect((await ctx.as('post', '/api/demo/reset').send({ confirm: 'nej' })).status).toBe(400);
    const res = await ctx.as('post', '/api/demo/reset').send({ confirm: 'ÅTERSTÄLL' });
    expect(res.status).toBe(200);
    expect(res.body.lass).toBeGreaterThan(100);
    expect(ctx.db.prepare(`SELECT COUNT(*) FROM customers WHERE name = 'Extra kund'`).pluck().get()).toBe(0);
    expect(ctx.db.prepare('SELECT COUNT(*) FROM companies').pluck().get()).toBe(1);
    expect(existsSync(ctx.config.photosDir) && readdirSync(ctx.config.photosDir).length).toBeGreaterThan(0);
    // The session still works: ids restart from 1.
    expect((await ctx.as('get', '/api/board')).status).toBe(200);
  }, 30_000);
});

describe('demo routes outside demo mode', () => {
  it('do not exist', async () => {
    const config = testConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')) });
    const db = testDb();
    seedDemo(db, { today: TODAY, password: PASSWORD });
    const app = createApp({ config, db, logger: silentLogger });
    const token = (await request(app).post('/api/auth/login').send({ email: DEMO_EMAIL, password: PASSWORD })).body.token;
    const res = await request(app).post('/api/demo/reset').set('Authorization', `Bearer ${token}`).send({ confirm: 'ÅTERSTÄLL' });
    expect(res.status).toBe(404);
  });
});
