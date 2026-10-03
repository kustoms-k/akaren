import { describe, it, expect } from 'vitest';
import { linkExpiry, buildAssignmentSms, gsmSafe, miljozonOk, shortDateSv } from '../lib/dispatch.js';
import { postProcessVagsedel } from '../lib/vagsedelExtraction.js';
import { reviewStatusFor, submittedConfidence } from '../lib/lassReview.js';
import { mf } from './fixtures.js';

describe('magic link expiry', () => {
  const now = new Date('2026-10-05T06:00:00Z'); // Monday 08:00 Stockholm
  it('lasts until the end of the day after the last assigned date', () => {
    // Last date Wed 7 Oct -> valid until Fri 9 Oct 00:00 Stockholm (= 8 Oct 22:00 UTC).
    expect(linkExpiry({ now, lastAssignedDate: '2026-10-07', maxDays: 7 })).toBe('2026-10-08T22:00:00.000Z');
  });
  it('is capped at maxDays', () => {
    expect(linkExpiry({ now, lastAssignedDate: '2026-11-30', maxDays: 7 })).toBe('2026-10-12T06:00:00.000Z');
  });
  it('lasts at least 12 hours (link sent late in the day)', () => {
    const late = new Date('2026-10-05T20:00:00Z');
    expect(linkExpiry({ now: late, lastAssignedDate: '2026-10-04', maxDays: 7 })).toBe('2026-10-06T08:00:00.000Z');
    expect(linkExpiry({ now: late, lastAssignedDate: null, maxDays: 7 })).toBe('2026-10-06T08:00:00.000Z');
  });
});

describe('assignment SMS', () => {
  const sms = buildAssignmentSms({
    driverName: 'Mikael Lund', datum: '2026-10-06', tid: '07:00', typeLabel: 'Schakt',
    projectName: 'Kv. Rörstrand – schakt', address: 'Rörstrandsgatan 40 Stockholm', regnr: 'TKA412',
    link: 'http://192.168.32.11:5173/f/AbCdEfGhIjKlMnOpQrStUv', companyName: 'Teståkeriet AB',
  });

  it('is short, readable Swedish with the link', () => {
    expect(sms).toBe('Hej Mikael! Uppdrag tis 6 okt kl 07:00 med TKA412: Schakt, Kv. Rörstrand - schakt, Rörstrandsgatan 40 Stockholm. '
      + 'Info och lassrapport: http://192.168.32.11:5173/f/AbCdEfGhIjKlMnOpQrStUv /Teståkeriet AB');
    expect(sms.length).toBeLessThanOrEqual(306);
  });

  it('only uses GSM 03.38 characters (Swedish letters are fine, dashes and quotes are replaced)', () => {
    expect(gsmSafe('Åsa Öberg – ”Kv. Älgen”…')).toBe('Åsa Öberg - "Kv. Älgen"...');
    expect(gsmSafe('Łukasz Wójcik')).toBe('Lukasz Wojcik');
    expect(gsmSafe('m³')).toBe('m3');
  });

  it('formats Swedish short dates', () => {
    expect(shortDateSv('2026-10-06')).toBe('tis 6 okt');
    expect(shortDateSv('2026-12-31')).toBe('tor 31 dec');
  });
});

describe('miljözon check', () => {
  it('compares vehicle class to project zone', () => {
    expect(miljozonOk(0, 0)).toBe(true);
    expect(miljozonOk(1, 1)).toBe(true);
    expect(miljozonOk(0, 1)).toBe(false);
    expect(miljozonOk(1, 3)).toBe(false);
    expect(miljozonOk(3, 2)).toBe(true);
  });
});

const slip = (o = {}) => ({
  vagsedel_nr: mf('EKB418233'), datum: mf('2026-10-06'), tid: mf('09.42'), regnr: mf('TKA 412'), material: mf('Schaktmassor'),
  avfallskod: mf('17 05 04'), farligt_avfall: mf(false), netto_kg: mf(18420), brutto_kg: mf(32100), tara_kg: mf(13680),
  lastplats: mf(null, 'lag'), mottagare: mf('Ekbacka massmottagning'), mottagare_orgnr: mf('559404-1236'),
  mottagare_adress: mf(null, 'lag'), kund: mf(null, 'lag'), projekt: mf(null, 'lag'), ...o,
});
const ctx = { today: '2026-10-06', assignmentDate: '2026-10-06', assignedRegnr: 'TKA412' };

describe('postProcessVagsedel', () => {
  it('normalises a clean ticket without warnings', () => {
    const { fields, warnings } = postProcessVagsedel(slip(), ctx);
    expect(fields.regnr).toEqual({ value: 'TKA412', confidence: 'hog' });
    expect(fields.tid.value).toBe('09:42');
    expect(fields.avfallskod.value).toBe('170504');
    expect(fields.netto_kg).toEqual({ value: 18420, confidence: 'hog' });
    expect(fields.farligt_avfall).toEqual({ value: false, confidence: 'hog' });
    expect(warnings).toEqual([]);
  });

  it('flags a net weight that does not match gross minus tare', () => {
    const { fields, warnings } = postProcessVagsedel(slip({ netto_kg: mf(1842) }), ctx);
    expect(fields.netto_kg.confidence).toBe('lag');
    expect(warnings).toEqual(['Netto stämmer inte med brutto minus tara.']);
    expect(postProcessVagsedel(slip({ netto_kg: mf(184), brutto_kg: mf(null, 'lag') }), ctx).warnings).toEqual(['Nettovikten verkar orimlig.']);
  });

  it('flags another truck on the ticket', () => {
    const { fields, warnings } = postProcessVagsedel(slip({ regnr: mf('MXR27C') }), ctx);
    expect(fields.regnr.confidence).toBe('lag');
    expect(warnings[0]).toMatch(/MXR27C.*TKA412/);
  });

  it('flags future and old dates', () => {
    expect(postProcessVagsedel(slip({ datum: mf('2026-10-07') }), ctx).fields.datum.confidence).toBe('lag');
    expect(postProcessVagsedel(slip({ datum: mf('2026-09-20') }), ctx).fields.datum.confidence).toBe('medel');
  });

  it('marks unread fields as saknas', () => {
    const { fields } = postProcessVagsedel(slip({ netto_kg: mf(null, 'hog'), vagsedel_nr: mf('  ', 'hog') }), ctx);
    expect(fields.netto_kg.confidence).toBe('saknas');
    expect(fields.vagsedel_nr.confidence).toBe('saknas');
  });
});

describe('lass review rules', () => {
  const allGood = { datum: 'hog', vagsedel_nr: 'hog', netto_kg: 'medel', material: 'forare' };
  it('a photographed, clearly read lass needs no review', () => {
    expect(reviewStatusFor({ confidence: allGood, hasPhoto: true })).toEqual({ status: 'ok', reasons: [] });
  });
  it('lists every reason for review', () => {
    const r = reviewStatusFor({
      confidence: { ...allGood, netto_kg: 'lag', vagsedel_nr: 'saknas' },
      hasPhoto: false, duplicate: true, farligtAvfall: true, regnrMismatch: true,
    });
    expect(r.status).toBe('behover_granskas');
    expect(r.reasons).toEqual([
      'Inget foto på vågsedeln', 'Vågsedelnummer saknas', 'Nettovikt osäker',
      'Vågsedelnumret är redan rapporterat', 'Annat regnr på vågsedeln', 'Farligt avfall',
    ]);
  });
  it('keeps AI confidence for unchanged values and marks edits as the person', () => {
    const ai = { netto_kg: mf(18420, 'lag'), vagsedel_nr: mf('EKB1', 'hog'), material: mf('Schaktmassor', 'medel') };
    const c = submittedConfidence({ netto_kg: 18400, vagsedel_nr: 'ekb1', material: 'Schaktmassor', datum: '2026-10-06' }, ai, 'forare');
    expect(c).toMatchObject({ netto_kg: 'forare', vagsedel_nr: 'hog', material: 'medel', datum: 'forare', till_namn: 'saknas' });
  });
});
