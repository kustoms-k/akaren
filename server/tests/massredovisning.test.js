import { describe, it, expect } from 'vitest';
import { csvCell, toCsv, kgToTonCell, summarize, fileSlug, CSV_COLUMNS } from '../lib/massredovisning.js';

const row = (o = {}) => ({
  lass_id: 1, version: 1, datum: '2026-10-05', tid: '07:12', vagsedel_nr: 'EKB418233', vehicle_regnr: 'TKA412',
  material: 'Schaktmassor', avfallskod: '170504', farligt_avfall: false, netto_kg: 18420,
  fran_text: 'Rörstrandsgatan 40', till_namn: 'Ekbacka massmottagning', till_orgnr: '559404-1236',
  till_adress: 'Ekbackavägen 3, Upplands Väsby', review_status: 'ok', hazard_reported_on: null, ...o,
});

describe('csvCell', () => {
  it('quotes separators, quotes and newlines', () => {
    expect(csvCell('Ekbacka')).toBe('Ekbacka');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('Kv. "Lagern"')).toBe('"Kv. ""Lagern"""');
    expect(csvCell('rad 1\nrad 2')).toBe('"rad 1\nrad 2"');
    expect(csvCell(null)).toBe('');
  });

  it('neutralises spreadsheet formulas from untrusted text', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+46701740605')).toBe("'+46701740605");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-1')).toBe("'-1");
  });
});

describe('toCsv', () => {
  it('writes a BOM, a Swedish header row, semicolons and CRLF', () => {
    const csv = toCsv([row(), row({ lass_id: 2, farligt_avfall: true, netto_kg: null, review_status: 'behover_granskas' })]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(4); // header, two rows, trailing empty line
    expect(lines[0].split(';')).toEqual(CSV_COLUMNS.map(([h]) => h));
    expect(lines[1]).toBe('2026-10-05;07:12;EKB418233;TKA412;Schaktmassor;170504;Nej;18,420;Rörstrandsgatan 40;'
      + 'Ekbacka massmottagning;559404-1236;Ekbackavägen 3, Upplands Väsby;;OK;1');
    expect(lines[2]).toContain(';Ja;;');
    expect(lines[2]).toContain(';Ska granskas;');
  });
});

describe('kgToTonCell', () => {
  it('uses a decimal comma and no thousands separator', () => {
    expect(kgToTonCell(18420)).toBe('18,420');
    expect(kgToTonCell(1234567)).toBe('1234,567');
    expect(kgToTonCell(null)).toBe('');
  });
});

describe('summarize', () => {
  it('groups by material, waste code and destination and counts what needs attention', () => {
    const { summary, totals } = summarize([
      row({ netto_kg: 18000 }),
      row({ netto_kg: 17000 }),
      row({ material: 'Förorenade massor', avfallskod: '170503', farligt_avfall: true, netto_kg: 16000, review_status: 'behover_granskas' }),
      row({ netto_kg: null }),
    ]);
    expect(totals).toEqual({ count: 4, netto_kg: 51000, missing_weight: 1, farligt_avfall: 1, unreviewed: 1 });
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({ material: 'Schaktmassor', till_namn: 'Ekbacka massmottagning', count: 3, netto_kg: 35000 });
    expect(summary[1]).toMatchObject({ material: 'Förorenade massor', farligt_avfall: true, count: 1 });
  });
});

describe('fileSlug', () => {
  it('makes an ASCII file-name part', () => {
    expect(fileSlug('Kv. Rörstrand – schakt')).toBe('kv-rorstrand-schakt');
    expect(fileSlug('Täby Park etapp 3')).toBe('taby-park-etapp-3');
    expect(fileSlug('––')).toBe('projekt');
  });
});
