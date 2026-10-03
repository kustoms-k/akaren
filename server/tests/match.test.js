import { describe, it, expect } from 'vitest';
import { suggestMatches, confidentPick, similarNames, nameScore, addressScore, normalizeName } from '../lib/match.js';
import { postProcessOrder } from '../lib/orderExtraction.js';
import { ORDER_EMAIL, ORDER_EMAIL_OUTPUT, orderOutput, mf } from './fixtures.js';

const customers = [
  { id: 1, name: 'Norrbacka Mark & Anläggning AB', org_nr: '559101-2348', email: 'faktura@norrbacka-mark.example' },
  { id: 2, name: 'Saltsjö Bygg & Entreprenad AB', org_nr: '559212-6782', email: 'ekonomi@saltsjobygg.example' },
  { id: 3, name: 'Ekhagens Fastighetsutveckling AB', org_nr: '559303-4563', email: 'inkop@gmail.com' },
  { id: 4, name: 'Norrby Schakt AB', org_nr: null, email: null },
];
const projects = [
  { id: 10, customer_id: 1, customer_name: 'Norrbacka', name: 'Kv. Rörstrand – schakt', address: 'Rörstrandsgatan 40', customer_ref: 'NMA-2611', miljozon: 1 },
  { id: 11, customer_id: 1, customer_name: 'Norrbacka', name: 'Täby Park etapp 3 – VA-schakt', address: 'Stora Marknadsvägen 15', customer_ref: 'NMA-2604', miljozon: 0 },
  { id: 12, customer_id: 2, customer_name: 'Saltsjö', name: 'Orminge centrum – grundläggning', address: 'Kanholmsvägen 2', customer_ref: 'SBE-118', miljozon: 0 },
];
const fieldsOf = (output) => postProcessOrder(output, { today: '2026-10-03' }).fields;

describe('name and address scoring', () => {
  it('ignores legal suffixes, case and diacritics', () => {
    expect(normalizeName('Norrbacka Mark & Anläggning AB')).toBe('norrbacka mark anlaggning');
    expect(nameScore('NORRBACKA MARK OCH ANLÄGGNING', 'Norrbacka Mark & Anläggning AB')).toBeGreaterThan(0.85);
  });

  it('matches a distinctive short name but not generic trade words', () => {
    expect(nameScore('Norrbacka', 'Norrbacka Mark & Anläggning AB')).toBeGreaterThanOrEqual(0.85);
    expect(nameScore('Bygg AB', 'Saltsjö Bygg & Entreprenad AB')).toBeLessThan(0.5);
  });

  it('compares street and number', () => {
    expect(addressScore('Rörstrandsgatan 40, Stockholm', 'Rörstrandsgatan 40')).toBe(0.95);
    expect(addressScore('Rorstrandsgatan 12', 'Rörstrandsgatan 40')).toBe(0.4);
    expect(addressScore('Sveavägen 1', 'Rörstrandsgatan 40')).toBe(0);
  });
});

describe('suggestMatches', () => {
  it('finds customer and project from a real-looking order email', () => {
    const s = suggestMatches({ customers, projects, fields: fieldsOf(ORDER_EMAIL_OUTPUT), rawText: ORDER_EMAIL });
    expect(s.customers[0]).toMatchObject({ id: 1 });
    expect(s.customers[0].reasons).toEqual(expect.arrayContaining(['E-post från @norrbacka-mark.example', 'Namnet liknar']));
    expect(s.projects[0]).toMatchObject({ id: 10 });
    expect(s.projects[0].reasons).toEqual(expect.arrayContaining(['Referensen NMA-2611 finns i texten', 'Samma adress']));
    expect(confidentPick(s.customers)?.id).toBe(1);
    expect(confidentPick(s.projects)?.id).toBe(10);
  });

  it('prefers an exact org number over a similar name', () => {
    const s = suggestMatches({
      customers, projects, rawText: 'x',
      fields: fieldsOf(orderOutput({ kund: mf('Norrby Schakt'), kund_orgnr: mf('559212-6782') })),
    });
    expect(s.customers[0]).toMatchObject({ id: 2, score: 1, reasons: ['Samma organisationsnummer'] });
  });

  it('does not treat free-mail domains as a company signal', () => {
    const s = suggestMatches({ customers, projects, fields: fieldsOf(orderOutput()), rawText: 'Från: kalle@gmail.com' });
    expect(s.customers.find((c) => c.id === 3)).toBeUndefined();
  });

  it('suggests nothing for an unknown customer', () => {
    const s = suggestMatches({
      customers, projects, rawText: 'Hej från Vallentuna Grus',
      fields: fieldsOf(orderOutput({ kund: mf('Vallentuna Grus AB'), adress: mf('Okändavägen 3') })),
    });
    expect(s.customers).toEqual([]);
    expect(s.projects).toEqual([]);
  });

  it('only pre-selects a clear winner', () => {
    expect(confidentPick([{ id: 1, score: 0.86 }, { id: 2, score: 0.8 }])).toBeNull();
    expect(confidentPick([{ id: 1, score: 0.7 }])).toBeNull();
    expect(confidentPick([{ id: 1, score: 0.95 }, { id: 2, score: 0.5 }])).toMatchObject({ id: 1 });
  });
});

describe('similarNames (duplicate guard)', () => {
  it('flags near-identical customer names', () => {
    expect(similarNames('Norrbacka Mark och Anläggning', customers).map((c) => c.id)).toEqual([1]);
    expect(similarNames('Vallentuna Grus AB', customers)).toEqual([]);
  });
});
