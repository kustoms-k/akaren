import { describe, it, expect } from 'vitest';
import { differences, estimateValue, facilityMatches, reconcile, suggestAssignment } from '../lib/reconcile.js';

const EKBACKA = { name: 'Ekbacka massmottagning', orgnr: '559404-1236' };
const PERIOD = { from: '2026-09-28', to: '2026-10-02' };

let nextRow = 1;
const row = (o = {}) => ({
  id: nextRow, line_no: nextRow++, datum: '2026-09-28', tid: '07:12', vagsedel_nr: null, regnr: 'TKA412', netto_kg: 18420,
  material: 'Schaktmassor', referens: null, resolution: null, resolution_note: null, resolved_lass_id: null, ...o,
});
const lass = (o = {}) => ({
  lass_id: 100, datum: '2026-09-28', tid: '07:12', vagsedel_nr: 'EKB418233', vehicle_regnr: 'TKA412', netto_kg: 18420,
  till_namn: 'Ekbacka massmottagning', till_orgnr: '559404-1236', job_id: 1, ...o,
});
const run = (rows, l) => reconcile({ rows, lass: l, facility: EKBACKA, period: PERIOD });

describe('facilityMatches', () => {
  it('compares org numbers when both have one', () => {
    expect(facilityMatches(lass(), EKBACKA)).toBe(true);
    expect(facilityMatches(lass({ till_orgnr: '559101-2348' }), EKBACKA)).toBe(false);
  });

  it('otherwise needs a distinctive word in common, not just "mottagning" or "AB"', () => {
    const noOrg = { name: 'Ekbacka Mottagning AB', orgnr: null };
    expect(facilityMatches(lass({ till_orgnr: null }), noOrg)).toBe(true);
    expect(facilityMatches(lass({ till_orgnr: null, till_namn: 'Skogsås återvinning' }), noOrg)).toBe(false);
    expect(facilityMatches(lass({ till_orgnr: null, till_namn: 'Mottagning AB' }), noOrg)).toBe(false);
    expect(facilityMatches(lass({ till_orgnr: null, till_namn: null }), noOrg)).toBe(false);
  });
});

describe('reconcile', () => {
  it('matches on the ticket number', () => {
    const r = run([row({ vagsedel_nr: 'EKB418233' })], [lass()]);
    expect(r.rows[0]).toMatchObject({ status: 'matchad', match: { lass_id: 100, kind: 'vagsedel' }, differences: [] });
    expect(r.totals).toMatchObject({ rows: 1, matchad: 1, saknas: 0, unlisted: 0 });
  });

  it('matches a ticket written without its prefix by its digits', () => {
    const r = run([row({ vagsedel_nr: '418233', regnr: null })], [lass()]);
    expect(r.rows[0].match).toEqual({ lass_id: 100, kind: 'vagsedel' });
  });

  it('does not match bare digits to another facility\'s ticket on another truck', () => {
    const other = lass({ till_namn: 'Lindhovs bergtäkt', till_orgnr: null, vehicle_regnr: 'MXR27C', vagsedel_nr: 'LH418233' });
    const r = run([row({ vagsedel_nr: '418233' })], [other]);
    expect(r.rows[0].status).toBe('saknas');
  });

  it('pairs by truck, day and weight when the list has no ticket numbers', () => {
    const a = lass({ lass_id: 1, tid: '07:10', netto_kg: 18400 });
    const b = lass({ lass_id: 2, tid: '08:30', netto_kg: 16000, vagsedel_nr: 'EKB418236' });
    const r = run([row({ tid: '08:33', netto_kg: 16020 }), row({ tid: '07:14', netto_kg: 18420 })], [a, b]);
    expect(r.rows.map((x) => x.match)).toEqual([{ lass_id: 2, kind: 'fordon_dag' }, { lass_id: 1, kind: 'fordon_dag' }]);
    // 20 kg apart: inside the pairing tolerance, but still a difference on the invoice
    expect(r.rows[0].differences).toEqual([{ field: 'netto_kg', list: 16020, lass: 16000 }]);
  });

  it('catches a misread weight: the only lass of the truck that day pairs with the only weighing', () => {
    const misread = lass({ netto_kg: 1840, tid: '11:00' });
    const r = run([row({ netto_kg: 18400, tid: '07:12', vagsedel_nr: null })], [misread]);
    expect(r.rows[0]).toMatchObject({ status: 'avvikelse', match: { kind: 'fordon_dag' } });
    expect(r.rows[0].differences).toEqual([{ field: 'netto_kg', list: 18400, lass: 1840 }]);
    expect(r.totals.weight_diff_kg).toBe(16560);
  });

  it('reports weighings with no lass as missing, and keeps ignored ones apart', () => {
    const r = run([
      row({ vagsedel_nr: 'EKB418233' }),
      row({ vagsedel_nr: 'EKB418240', tid: '13:00', netto_kg: 17000 }),
      row({ vagsedel_nr: 'EKB418245', tid: '15:00', netto_kg: 16000, resolution: 'ignorerad', resolution_note: 'Inte vår bil' }),
    ], [lass()]);
    expect(r.rows.map((x) => x.status)).toEqual(['matchad', 'saknas', 'ignorerad']);
    expect(r.totals).toMatchObject({ saknas: 1, ignorerad: 1, saknas_kg: 17000, list_kg: 18420 + 17000 + 16000 });
  });

  it('lists lass to the facility in the period that are not on the list', () => {
    const r = run([row({ vagsedel_nr: 'EKB418233' })], [
      lass(),
      lass({ lass_id: 101, vagsedel_nr: 'EKB418250', datum: '2026-09-30', vehicle_regnr: 'TKA418' }),
      lass({ lass_id: 102, vagsedel_nr: 'SK-77101', till_namn: 'Skogsås återvinning', till_orgnr: null }),   // another facility
      lass({ lass_id: 103, vagsedel_nr: 'EKB418999', datum: '2026-10-05' }),                                // after the period
    ]);
    expect(r.unlisted.map((l) => l.lass_id)).toEqual([101]);
  });

  it('uses each lass once, and prefers the lass the office created from the row', () => {
    const created = lass({ lass_id: 7, vagsedel_nr: null });
    const r = run([
      row({ id: 50, line_no: 50, vagsedel_nr: null, resolution: 'lass_skapad', resolved_lass_id: 7 }),
      row({ id: 51, line_no: 51, vagsedel_nr: null }),
    ], [created]);
    expect(r.rows.find((x) => x.id === 50).match).toEqual({ lass_id: 7, kind: 'skapad' });
    expect(r.rows.find((x) => x.id === 51).status).toBe('saknas');
  });

  it('matches a ticket within three days and notes the date difference', () => {
    const r = run([row({ vagsedel_nr: 'EKB418233', datum: '2026-09-29' })], [lass()]);
    expect(r.rows[0].status).toBe('avvikelse');
    expect(r.rows[0].differences).toEqual([{ field: 'datum', list: '2026-09-29', lass: '2026-09-28' }]);
  });
});

describe('differences', () => {
  it('ignores weight within 10 kg and ticket formatting', () => {
    expect(differences(row({ vagsedel_nr: 'EKB-418233', netto_kg: 18430 }), lass())).toEqual([]);
    expect(differences(row({ netto_kg: 18440 }), lass())).toEqual([{ field: 'netto_kg', list: 18440, lass: 18420 }]);
  });

  it('reports a weight the lass is missing, and another truck', () => {
    expect(differences(row({ regnr: 'TKA418' }), lass({ netto_kg: null }))).toEqual([
      { field: 'netto_kg', list: 18420, lass: null },
      { field: 'regnr', list: 'TKA418', lass: 'TKA412' },
    ]);
  });
});

describe('estimateValue', () => {
  const lists = [
    { id: 1, name: 'Standard', is_default: 1, items: [
      { id: 1, uppdragstyp: 'schakt', material: null, unit: 'lass', price_ore: 245000 },
      { id: 2, uppdragstyp: 'kran', material: null, unit: 'timme', price_ore: 129000 },
    ] },
    { id: 2, name: 'Avtal', is_default: 0, items: [{ id: 3, uppdragstyp: 'schakt', material: null, unit: 'ton', price_ore: 13200 }] },
  ];
  const job = { uppdragstyp: 'schakt', material: 'Schaktmassor' };

  it('prices per ton on the customer\'s list, and per load on the default list', () => {
    expect(estimateValue({ job, customer: { price_list_id: 2 }, priceLists: lists, nettoKg: 18420 }))
      .toMatchObject({ unit: 'ton', price_ore: 13200, amount_ore: 243144, price_source: 'Avtal' });
    expect(estimateValue({ job, customer: { price_list_id: null }, priceLists: lists, nettoKg: 18420 }))
      .toMatchObject({ unit: 'lass', amount_ore: 245000 });
  });

  it('says why there is no amount', () => {
    expect(estimateValue({ job, customer: { price_list_id: 2 }, priceLists: lists, nettoKg: null }).note).toBe('Vikt saknas');
    expect(estimateValue({ job: { uppdragstyp: 'kran' }, priceLists: lists }).note).toBe('Ingår i timdebiteringen');
    expect(estimateValue({ job: { uppdragstyp: 'ovrigt' }, priceLists: [] }).note).toBe('Pris saknas');
  });
});

describe('suggestAssignment', () => {
  it('prefers the assignment whose lass went to the facility', () => {
    expect(suggestAssignment([{ id: 1, lass_to_facility: 0 }, { id: 2, lass_to_facility: 5 }]).id).toBe(2);
    expect(suggestAssignment([{ id: 3 }, { id: 2 }]).id).toBe(2);
    expect(suggestAssignment([])).toBeNull();
  });
});
