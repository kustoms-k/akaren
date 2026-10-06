import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { testConfig, testDb, silentLogger } from './helpers.js';
import { createApp } from '../app.js';
import { seedDemo } from '../seed/demo.js';
import { stockholmDate } from '../lib/dates.js';
import { isValidWeek, shiftWeek, weekLabel, weekOf } from '../lib/weeks.js';
import { lineAmount, lineQuantity, listsFor, materialMatches, resolvePrice, vatFor } from '../lib/pricing.js';
import { buildUnderlag } from '../lib/fakturaunderlag.js';
import { DESCRIPTION_MAX, REVERSE_CHARGE_TEXT, buildFortnoxInvoice } from '../lib/fortnoxPayload.js';
import { FortnoxApiError } from '../services/fortnox.js';

describe('ISO weeks', () => {
  it('validates, shifts across years and labels', () => {
    expect(isValidWeek('2026-W41')).toBe(true);
    expect(isValidWeek('2026-W53')).toBe(true);    // 2026 has 53 ISO weeks
    expect(isValidWeek('2025-W53')).toBe(false);
    expect(isValidWeek('2026-41')).toBe(false);
    expect(isValidWeek(undefined)).toBe(false);
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
    expect(weekOf('2027-01-01')).toBe('2026-W53');
    expect(weekLabel('2026-W41')).toBe('v. 41 · 5–11 okt 2026');
    expect(weekLabel('2026-W40')).toBe('v. 40 · 28 sep – 4 okt 2026');
    expect(weekLabel('2026-W53')).toBe('v. 53 · 28 dec 2026 – 3 jan 2027');
  });
});

const item = (id, uppdragstyp, material, unit, priceOre) => ({ id, uppdragstyp, material, unit, price_ore: priceOre });
const STANDARD = { id: 1, name: 'Standard', is_default: 1, items: [item(1, 'schakt', null, 'lass', 245000), item(2, 'kran', null, 'timme', 129000), item(3, null, null, 'timme', 105000)] };
const AVTAL = { id: 2, name: 'Avtal', is_default: 0, items: [item(4, 'schakt', null, 'ton', 13200), item(5, 'schakt', 'Förorenade massor', 'ton', 21500)] };
const PROJEKT = { id: 3, name: 'Projekt', is_default: 0, items: [item(6, 'schakt', 'Bergkross', 'ton', 9000)] };

describe('price resolution', () => {
  it('takes the most specific item of the first list that has one', () => {
    const lists = listsFor([STANDARD, AVTAL, PROJEKT], { projectListId: 3, customerListId: 2 });
    expect(lists.map((l) => l.id)).toEqual([3, 2, 1]);
    expect(resolvePrice(lists, { uppdragstyp: 'schakt', material: 'Förorenade massor (PAH över MKM)' }).item.id).toBe(5);
    expect(resolvePrice(lists, { uppdragstyp: 'schakt', material: 'Schaktmassor' }).item.id).toBe(4);
    expect(resolvePrice(lists, { uppdragstyp: 'schakt', material: 'Bergkross 0–32' }).list.name).toBe('Projekt');
    expect(resolvePrice(lists, { uppdragstyp: 'kran' }).item.id).toBe(2);
    expect(resolvePrice(lists, { uppdragstyp: 'container' }).item.id).toBe(3);   // generic fallback
    expect(resolvePrice(lists, { uppdragstyp: 'container', units: ['fast'] })).toBeNull();
    expect(resolvePrice([AVTAL], { uppdragstyp: 'kran' })).toBeNull();
    expect(listsFor([STANDARD, AVTAL], { customerListId: 1 }).map((l) => l.id)).toEqual([1]);
  });

  it('matches material without case or diacritics trouble', () => {
    expect(materialMatches('Förorenade massor', 'förorenade  MASSOR, 17 05 03*')).toBe(true);
    expect(materialMatches('Förorenade massor', 'Schaktmassor')).toBe(false);
    expect(materialMatches('', 'Schaktmassor')).toBe(false);
  });

  it('computes amounts in öre, rounding per line', () => {
    expect(lineAmount('ton', 13200, { nettoKg: 17960 })).toBe(237072);
    expect(lineAmount('ton', 9850, { nettoKg: 13333 })).toBe(131330);   // 1313.3005 kr → 1313.30
    expect(lineAmount('ton', 13200, {})).toBeNull();
    expect(lineAmount('timme', 135000, { hours: 8.5 })).toBe(1147500);
    expect(lineAmount('lass', 245000)).toBe(245000);
    expect(lineQuantity('ton', { nettoKg: 17960 })).toBe(17.96);
    expect(vatFor('normal', 100001)).toEqual({ rate: 25, vat_ore: 25000, total_ore: 125001 });
    expect(vatFor('omvand_bygg', 100000)).toEqual({ rate: 0, vat_ore: 0, total_ore: 100000 });
  });
});

describe('underlag builder', () => {
  const base = {
    week: '2026-W41', from: '2026-10-05', to: '2026-10-11', companyVatMode: 'normal',
    customers: [{ id: 1, name: 'Norrbacka', vat_mode: 'omvand_bygg', price_list_id: 2, fortnox_customer_nr: '12' }, { id: 2, name: 'Ekhagen', vat_mode: null, price_list_id: null }],
    projects: [{ id: 10, customer_id: 1, name: 'Rörstrand', customer_ref: 'NMA-2611', price_list_id: null }, { id: 20, customer_id: 2, name: 'Lagern', price_list_id: null }],
    priceLists: [STANDARD, AVTAL],
    jobs: [
      { id: 100, customer_id: 1, project_id: 10, uppdragstyp: 'schakt', material: 'Schaktmassor', datum_fran: '2026-09-28', status: 'pagar' },
      { id: 200, customer_id: 2, project_id: 20, uppdragstyp: 'kran', material: null, datum_fran: '2026-09-28', status: 'pagar' },
    ],
    hours: [
      { assignment_id: 7, job_id: 200, datum: '2026-10-06', regnr: 'KRN905', driver_name: 'Jonas', timmar: 8.5 },
      { assignment_id: 8, job_id: 200, datum: '2026-10-07', regnr: 'KRN905', driver_name: 'Jonas', timmar: null },
    ],
    invoiced: { lass: new Map(), hours: new Map(), jobs: new Map() },
  };
  const lass = (id, extra = {}) => ({
    lass_id: id, version: 1, customer_id: 1, project_id: 10, job_id: 100, datum: '2026-10-05', tid: '07:10',
    vagsedel_nr: `EKB${id}`, vehicle_regnr: 'TKA412', material: 'Schaktmassor', netto_kg: 18000, till_namn: 'Ekbacka', review_status: 'ok', ...extra,
  });

  it('groups per customer and project, prices and blocks', () => {
    const u = buildUnderlag({ ...base, lass: [lass(1), lass(2, { material: 'Förorenade massor', review_status: 'behover_granskas' }), lass(3, { netto_kg: null })] });
    expect(u.groups.map((g) => g.customer.name)).toEqual(['Ekhagen', 'Norrbacka']);
    const nb = u.groups[1];
    expect(nb.vat_mode).toBe('omvand_bygg');
    expect(nb.rows.map((r) => r.amount_ore)).toEqual([237600, 387000, null]);
    expect(nb.rows.map((r) => r.blockers)).toEqual([[], ['granskas'], ['vikt_saknas']]);
    expect(nb.status).toBe('blockerad');
    expect(nb.blockers).toEqual([{ code: 'granskas', label: 'Ska granskas', count: 1 }, { code: 'vikt_saknas', label: 'Vikt saknas', count: 1 }]);
    expect(nb.totals).toMatchObject({ net_ore: 624600, vat_ore: 0, total_ore: 624600, blocked: 2 });

    const ek = u.groups[0];
    expect(ek.rows.map((r) => [r.kind, r.amount_ore, r.blockers])).toEqual([['timmar', 1096500, []], ['timmar', null, ['timmar_saknas']]]);
    expect(ek.totals.vat_ore).toBe(274125);
    expect(u.totals).toMatchObject({ groups: 2, ready: 0, blocked: 2 });
  });

  it('marks invoiced rows and lets new work through as a partial', () => {
    const invoiced = { ...base.invoiced, lass: new Map([[1, { batch_id: 9, kind: 'fortnox', fortnox_document_nr: '1043' }]]) };
    const u = buildUnderlag({ ...base, hours: [], invoiced, lass: [lass(1), lass(2)] });
    const g = u.groups[0];
    expect(g.status).toBe('delvis');
    expect(g.totals).toMatchObject({ open: 1, invoiced: 1, net_ore: 237600, invoiced_net_ore: 237600 });
    const all = buildUnderlag({ ...base, hours: [], invoiced, lass: [lass(1)] });
    expect(all.groups[0].status).toBe('fakturerad');
  });

  it('bills a fixed-price job once, in the week it starts, and skips cancelled jobs', () => {
    const lists = [{ ...STANDARD, items: [...STANDARD.items, item(9, 'container', null, 'fast', 395000)] }];
    const jobs = [...base.jobs,
      { id: 300, customer_id: 2, project_id: 20, uppdragstyp: 'container', material: 'Blandat byggavfall', datum_fran: '2026-10-06', status: 'klar' },
      { id: 301, customer_id: 2, project_id: 20, uppdragstyp: 'container', material: null, datum_fran: '2026-10-07', status: 'avbruten' }];
    const u = buildUnderlag({ ...base, priceLists: lists, jobs, hours: [], lass: [lass(5, { job_id: 300, customer_id: 2, project_id: 20 })] });
    const rows = u.groups[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'fast', job_id: 300, amount_ore: 395000, description: 'Container Blandat byggavfall' });
    const later = buildUnderlag({ ...base, from: '2026-10-12', to: '2026-10-18', priceLists: lists, jobs, hours: [], lass: [] });
    expect(later.groups).toHaveLength(0);
  });
});

describe('Fortnox payload', () => {
  const group = {
    customer: { fortnox_customer_nr: '1007' }, project: { name: 'Kv. Rörstrand – schakt', customer_ref: 'NMA-2611' }, vat_mode: 'omvand_bygg',
  };
  const rows = [
    { description: 'EKB418321 6/10 Förorenade massor (PAH över MKM), 17 05 03*', unit: 'ton', quantity: 17.96, price_ore: 21500 },
    { description: '6/10 Kranbil KRN905', unit: 'timme', quantity: 8.5, price_ore: 135000 },
  ];

  it('builds an unbooked draft with references, reverse charge and Fortnox units', () => {
    const { Invoice: inv } = buildFortnoxInvoice({ group, rows, week: '2026-W41', externalRef: 'abc-123' });
    expect(inv.CustomerNumber).toBe('1007');
    expect(inv.YourReference).toBe('NMA-2611');
    expect(inv.ExternalInvoiceReference1).toBe('abc-123');
    expect(inv.ExternalInvoiceReference2).toBe('2026-W41');
    expect(inv.VATIncluded).toBe(false);
    expect(inv.Remarks).toContain(REVERSE_CHARGE_TEXT);
    expect(inv.Remarks).toContain('v. 41 · 5–11 okt 2026');
    expect(inv.InvoiceRows[0]).toEqual({ Description: 'EKB418321 6/10 Förorenade massor (PAH över MKM)…', DeliveredQuantity: 17.96, Unit: 't', Price: 215, VAT: 0 });
    expect(inv.InvoiceRows[0].Description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(inv.InvoiceRows[1]).toMatchObject({ DeliveredQuantity: 8.5, Unit: 'tim', Price: 1350 });
    expect(inv).not.toHaveProperty('Booked');
  });

  it('uses 25 % VAT normally and refuses unmapped customers or empty drafts', () => {
    const inv = buildFortnoxInvoice({ group: { ...group, vat_mode: 'normal' }, rows, week: '2026-W41', externalRef: 'x' }).Invoice;
    expect(inv.InvoiceRows.every((r) => r.VAT === 25)).toBe(true);
    expect(inv.Remarks).not.toContain('Omvänd');
    expect(() => buildFortnoxInvoice({ group: { ...group, customer: {} }, rows, week: '2026-W41', externalRef: 'x' })).toThrow();
    expect(() => buildFortnoxInvoice({ group, rows: [], week: '2026-W41', externalRef: 'x' })).toThrow();
  });
});

describe('fakturaunderlag API', () => {
  let app;
  let db;
  let as;
  let seed;
  let fx;

  function fakeFortnox() {
    const state = { status: 'connected', invoices: [], customers: [], failNext: null };
    return {
      state,
      getStatus: () => ({ configured: true, status: state.status, connected_at: null, last_sync_at: null }),
      async createInvoice(companyId, payload) {
        if (state.failNext) { const e = state.failNext; state.failNext = null; if (e.created) state.invoices.push({ ...payload.Invoice, DocumentNumber: 2000 + state.invoices.length }); throw e.error; }
        const inv = { ...payload.Invoice, DocumentNumber: 1001 + state.invoices.length };
        state.invoices.push(inv);
        return inv;
      },
      async findInvoiceByExternalRef(companyId, ref) { return state.invoices.find((i) => i.ExternalInvoiceReference1 === ref) ?? null; },
      async createCustomer(companyId, c) { state.customers.push(c); return String(500 + state.customers.length); },
    };
  }

  beforeEach(async () => {
    db = testDb();
    seed = seedDemo(db, { today: stockholmDate(), password: 'hemligt123', withInbox: false });
    fx = fakeFortnox();
    app = createApp({ config: testConfig(), db, services: { fortnox: fx }, logger: silentLogger });
    const login = await request(app).post('/api/auth/login').send({ email: seed.email, password: 'hemligt123' });
    as = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${login.body.token}`);
  });

  const week = () => seed.previousWeek;
  const groupOf = async (w, name) => (await as('get', `/api/fakturaunderlag?week=${w}`)).body.groups.find((g) => g.project.name.startsWith(name));
  const ids = (g, w = week()) => ({ week: w, customer_id: g.customer.id, project_id: g.project.id });

  it('shows the week with navigation, defaulting to the current week', async () => {
    const res = await as('get', '/api/fakturaunderlag');
    expect(res.body.week).toBe(seed.currentWeek);
    expect(res.body.prev_week).toBe(seed.previousWeek);
    expect(res.body.prev_week_open_lass).toBeGreaterThan(0);
    const prev = (await as('get', `/api/fakturaunderlag?week=${week()}`)).body;
    expect(prev.groups.map((g) => g.status)).toEqual(['klar', 'klar', 'klar', 'klar']);
    expect(prev.totals.ready).toBe(4);
    // The current week has lass waiting for review, which blocks those projects.
    const cur = (await as('get', `/api/fakturaunderlag?week=${seed.currentWeek}`)).body;
    expect(cur.groups.some((g) => g.status === 'blockerad' && g.blockers[0].code === 'granskas')).toBe(true);
  });

  it('locks an underlag so nothing is invoiced twice, and voids it again', async () => {
    const g = await groupOf(week(), 'Arenastaden');
    const lock = await as('post', '/api/fakturaunderlag/lock').send(ids(g)).expect(201);
    expect(lock.body).toMatchObject({ kind: 'manuell', rows: g.totals.open, total_ore: g.totals.net_ore });
    expect((await groupOf(week(), 'Arenastaden')).status).toBe('fakturerad');
    await as('post', '/api/fakturaunderlag/lock').send(ids(g)).expect(409);
    await as('post', '/api/fakturaunderlag/fortnox').send(ids(g)).expect(409);

    const csv = await as('get', `/api/fakturaunderlag/export.csv?week=${week()}&customer_id=${g.customer.id}&project_id=${g.project.id}`).expect(200);
    expect(csv.text.startsWith('﻿Datum;Beskrivning')).toBe(true);
    expect(csv.text).toContain(';Låst\r\n');

    await as('post', `/api/fakturaunderlag/batches/${lock.body.id}/void`).expect(200);
    expect((await groupOf(week(), 'Arenastaden')).status).toBe('klar');
    await as('post', `/api/fakturaunderlag/batches/${lock.body.id}/void`).expect(409);
  });

  it('creates a Fortnox draft, maps the customer first, and blocks the lass from changing', async () => {
    const g = await groupOf(week(), 'Kv. Rörstrand');
    const notMapped = await as('post', '/api/fakturaunderlag/fortnox').send(ids(g)).expect(409);
    expect(notMapped.body.error.code).toBe('customer_not_in_fortnox');
    await as('post', `/api/fakturaunderlag/customers/${g.customer.id}/fortnox`).expect(201);
    expect(fx.state.customers[0].vat_mode).toBe('omvand_bygg');
    await as('post', `/api/fakturaunderlag/customers/${g.customer.id}/fortnox`).expect(409);

    const preview = (await as('get', `/api/fakturaunderlag/preview?week=${week()}&customer_id=${g.customer.id}&project_id=${g.project.id}`)).body;
    expect(preview.payload.Invoice.InvoiceRows).toHaveLength(g.rows.length);

    const res = await as('post', '/api/fakturaunderlag/fortnox').send(ids(g)).expect(201);
    expect(res.body).toMatchObject({ status: 'skapad', fortnox_document_nr: '1001' });
    const sent = fx.state.invoices[0];
    expect(sent.CustomerNumber).toBe('501');
    expect(sent.YourReference).toBe('NMA-2611');
    expect(sent.InvoiceRows.every((r) => r.VAT === 0)).toBe(true);
    const after = await groupOf(week(), 'Kv. Rörstrand');
    expect(after.status).toBe('fakturerad');
    expect(after.rows[0].invoiced).toMatchObject({ kind: 'fortnox', fortnox_document_nr: '1001' });

    // An invoiced lass can't be corrected.
    const lassId = after.rows[0].lass_id;
    const fix = await as('post', `/api/lass/${lassId}/versions`).send({ fields: { netto_kg: 12000 }, change_reason: 'Fel vikt' });
    expect(fix.status).toBe(409);
    expect(fix.body.error.code).toBe('invoiced');
  });

  it('releases the rows when Fortnox rejects the draft, and finds a draft created despite a timeout', async () => {
    const g = await groupOf(week(), 'Orminge');
    await as('post', `/api/fakturaunderlag/customers/${g.customer.id}/fortnox`).expect(201);

    fx.state.failNext = { error: new FortnoxApiError(400, 'POST', '/invoices', { ErrorInformation: { message: 'Enheten "t" finns inte.' } }) };
    const rejected = await as('post', '/api/fakturaunderlag/fortnox').send(ids(g)).expect(502);
    expect(rejected.body.error.message).toContain('Enheten "t" finns inte.');
    expect((await groupOf(week(), 'Orminge')).status).toBe('klar');
    const batches = (await as('get', `/api/fakturaunderlag?week=${week()}`)).body.batches;
    expect(batches[0]).toMatchObject({ status: 'misslyckad', line_count: 0 });

    // A timeout after Fortnox already created the draft: found by ExternalInvoiceReference1, not created twice.
    fx.state.failNext = { error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), created: true };
    const ok = await as('post', '/api/fakturaunderlag/fortnox').send(ids(g)).expect(201);
    expect(ok.body.fortnox_document_nr).toBe('2000');
    expect(fx.state.invoices).toHaveLength(1);
  });

  it('refuses blocked underlag and a disconnected Fortnox', async () => {
    const cur = (await as('get', `/api/fakturaunderlag?week=${seed.currentWeek}`)).body.groups.find((g) => g.status === 'blockerad');
    const blocked = await as('post', '/api/fakturaunderlag/lock').send(ids(cur, seed.currentWeek)).expect(409);
    expect(blocked.body.error.code).toBe('blocked');
    expect(blocked.body.error.message).toMatch(/ska granskas/);

    fx.state.status = 'reconnect_required';
    const g = await groupOf(week(), 'Arenastaden');
    const res = await as('post', '/api/fakturaunderlag/fortnox').send(ids(g)).expect(409);
    expect(res.body.error.code).toBe('fortnox_reconnect_required');
    await as('get', '/api/fakturaunderlag?week=2026-W99').expect(200);
    await as('post', '/api/fakturaunderlag/lock').send({ week: 'nope', customer_id: 1, project_id: 1 }).expect(400);
  });

  it('manages price lists, and a price change moves the underlag', async () => {
    const lists = (await as('get', '/api/price-lists')).body;
    const std = lists.find((l) => l.is_default);
    expect(std.items.length).toBeGreaterThan(0);
    const created = (await as('post', '/api/price-lists').send({ name: 'Saltsjö 2026' }).expect(201)).body;
    await as('post', `/api/price-lists/${created.id}/items`).send({ uppdragstyp: 'grus_leverans', material: '', unit: 'ton', price_ore: 10500 }).expect(201);
    await as('post', `/api/price-lists/${created.id}/items`).send({ uppdragstyp: 'grus_leverans', unit: 'liter', price_ore: 1 }).expect(400);
    const g = await groupOf(week(), 'Orminge');
    await as('patch', `/api/customers/${g.customer.id}`).send({ price_list_id: created.id }).expect(200);
    const after = await groupOf(week(), 'Orminge');
    expect(after.rows[0].price_ore).toBe(10500);
    expect(after.rows[0].price_source).toBe('Saltsjö 2026');
    await as('delete', `/api/price-lists/${created.id}`).expect(409);
    await as('delete', `/api/price-lists/${std.id}`).expect(409);
    await as('patch', `/api/price-lists/${created.id}`).send({ is_default: true }).expect(200);
    expect((await as('get', '/api/price-lists')).body.filter((l) => l.is_default).map((l) => l.id)).toEqual([created.id]);
  });
});
