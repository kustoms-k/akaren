import { describe, it, expect } from 'vitest';
import {
  detectDelimiter, headerField, parseDateTime, parseNumber, parseTime, parseWeighList, sanitizeMapping, suggestMapping,
  ticketDigits, ticketKey, toKg, tokenize, WeighListError,
} from '../lib/weighList.js';

// A typical export from a facility's scale system: title lines, then a header, then one row per weighing.
const EKBACKA_CSV = [
  'Ekbacka massmottagning AB;;;;;;',
  'Vägningsrapport 2026-09-28 – 2026-10-02;;;;;;',
  'Kund: Lagerviks Åkeri AB (kundnr 10442);;;;;;',
  ';;;;;;',
  'Datum;Tid;Vågsedelnr;Regnr;Artikel;Märkning;Netto (kg)',
  '2026-09-28;07:12;EKB418233;TKA 412;Schaktmassor;NMA-2611;18 420',
  '2026-09-28;08:31;EKB418236;TKA412;Schaktmassor;NMA-2611;17 960',
  '2026-09-29;07:05;EKB418301;tka412;"Schaktmassor; lera";NMA-2611;16540',
  'Summa;;;;;;52 920',
].join('\r\n');

describe('tokenize and detectDelimiter', () => {
  it('detects semicolons, tabs and commas', () => {
    expect(detectDelimiter(EKBACKA_CSV)).toBe(';');
    expect(detectDelimiter('Datum\tNetto\n2026-10-01\t18420\n2026-10-01\t17000')).toBe('\t');
    expect(detectDelimiter('Datum,Netto,Regnr\n2026-10-01,18420,ABC123')).toBe(',');
  });

  it('honours quotes and drops blank lines and the BOM', () => {
    const rows = tokenize('﻿a;"b;c";"d ""e"""\n\n1;2;3');
    expect(rows).toEqual([
      { line: 1, cells: ['a', 'b;c', 'd "e"'] },
      { line: 3, cells: ['1', '2', '3'] },
    ]);
  });
});

describe('headerField', () => {
  it('recognises the names scale systems use', () => {
    expect(headerField('Vågsedelnr')).toBe('vagsedel_nr');
    expect(headerField('Kvittonummer')).toBe('vagsedel_nr');
    expect(headerField('Reg.nr')).toBe('regnr');
    expect(headerField('Fordon')).toBe('regnr');
    expect(headerField('Netto (kg)')).toBe('netto_kg');
    expect(headerField('Nettovikt ton')).toBe('netto_kg');
    expect(headerField('Bruttovikt')).toBe('brutto_kg');
    expect(headerField('Artikelbenämning')).toBe('material');
    expect(headerField('Märkning')).toBe('referens');
    expect(headerField('Datum/tid')).toBe('datum');
    expect(headerField('Kommentar')).toBeNull();
    expect(headerField('')).toBeNull();
  });
});

describe('values', () => {
  it('reads Swedish and export date formats, with an optional time', () => {
    expect(parseDateTime('2026-10-05')).toEqual({ datum: '2026-10-05', tid: null });
    expect(parseDateTime('2026-10-05 07:12:44')).toEqual({ datum: '2026-10-05', tid: '07:12' });
    expect(parseDateTime('20261005')).toEqual({ datum: '2026-10-05', tid: null });
    expect(parseDateTime('05.10.2026')).toEqual({ datum: '2026-10-05', tid: null });
    expect(parseDateTime('5/10/2026 7.05')).toEqual({ datum: '2026-10-05', tid: '07:05' });
    expect(parseDateTime('5/10-26')).toEqual({ datum: '2026-10-05', tid: null });
    expect(parseDateTime('2026-02-30')).toBeNull();
    expect(parseDateTime('Summa')).toBeNull();
    expect(parseDateTime('')).toBeNull();
  });

  it('reads times', () => {
    expect(parseTime('7:05')).toBe('07:05');
    expect(parseTime('07.05.33')).toBe('07:05');
    expect(parseTime('2026-10-05 13:40')).toBe('13:40');
    expect(parseTime('25:00')).toBeNull();
  });

  it('reads numbers with Swedish separators and the unit in mind', () => {
    expect(parseNumber('18 420')).toBe(18420);
    expect(parseNumber('18 420')).toBe(18420);
    expect(parseNumber('18,42')).toBe(18.42);
    expect(parseNumber('18.42')).toBe(18.42);
    expect(parseNumber('18.420', 'kg')).toBe(18420);
    expect(parseNumber('18.420', 'ton')).toBe(18.42);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('18420 kg')).toBe(18420);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('converts to whole kilograms', () => {
    expect(toKg('18,42', 'ton')).toBe(18420);
    expect(toKg('18.425', 'ton')).toBe(18425);
    expect(toKg('18 420', 'kg')).toBe(18420);
    expect(toKg('0', 'kg')).toBeNull();
    expect(toKg('-20', 'kg')).toBeNull();
  });

  it('compares ticket numbers by letters and digits, or by digits alone', () => {
    expect(ticketKey('EKB-418 233')).toBe('EKB418233');
    expect(ticketKey('')).toBeNull();
    expect(ticketDigits('EKB418233')).toBe('418233');
    expect(ticketDigits('0041823')).toBe('41823');
    expect(ticketDigits('A12')).toBeNull();
  });
});

describe('suggestMapping', () => {
  it('maps known headers and guesses the weight unit from the header or the values', () => {
    expect(suggestMapping(['Datum', 'Regnr', 'Netto (ton)'])).toEqual({ columns: { datum: 0, regnr: 1, netto_kg: 2 }, unit: 'ton' });
    const rows = [{ cells: ['2026-10-01', '18,42'] }, { cells: ['2026-10-01', '17,9'] }];
    expect(suggestMapping(['Datum', 'Netto'], rows).unit).toBe('ton');
    expect(suggestMapping(['Datum', 'Netto'], [{ cells: ['2026-10-01', '18420'] }]).unit).toBe('kg');
  });

  it('uses a bare "Nr" as the ticket number only when nothing better is there', () => {
    expect(suggestMapping(['Nr', 'Datum', 'Kvitto', 'Netto']).columns.vagsedel_nr).toBe(2);
    expect(suggestMapping(['Nr', 'Datum', 'Netto']).columns.vagsedel_nr).toBe(0);
  });

  it('keeps the first column for a field', () => {
    expect(suggestMapping(['Datum', 'Netto', 'Vikt']).columns.netto_kg).toBe(1);
  });
});

describe('parseWeighList', () => {
  it('finds the header below the title lines and reads every weighing', () => {
    const p = parseWeighList(EKBACKA_CSV);
    expect(p.headerIndex).toBe(3);
    expect(p.mapping).toEqual({
      columns: { datum: 0, tid: 1, vagsedel_nr: 2, regnr: 3, material: 4, referens: 5, netto_kg: 6 },
      unit: 'kg',
    });
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0]).toEqual({
      line: 6, datum: '2026-09-28', tid: '07:12', vagsedel_nr: 'EKB418233', regnr: 'TKA412', netto_kg: 18420,
      material: 'Schaktmassor', referens: 'NMA-2611',
    });
    expect(p.rows[2]).toMatchObject({ regnr: 'TKA412', material: 'Schaktmassor; lera', netto_kg: 16540 });
    expect(p.period).toEqual({ from: '2026-09-28', to: '2026-09-29' });
    expect(p.skipped).toEqual([]); // the "Summa" row is not a weighing
  });

  it('reads rows pasted from Excel, in tonnes, with date and time in one column', () => {
    const text = 'Datum/tid\tKvitto\tBil\tNettovikt ton\n2026-10-01 07:40\t77104\tABC 123\t17,32\n2026-10-01 09:02\t77109\tABC123\t16,9\n';
    const p = parseWeighList(text);
    expect(p.rows.map((r) => [r.datum, r.tid, r.vagsedel_nr, r.regnr, r.netto_kg])).toEqual([
      ['2026-10-01', '07:40', '77104', 'ABC123', 17320],
      ['2026-10-01', '09:02', '77109', 'ABC123', 16900],
    ]);
  });

  it('computes netto from brutto and tara when there is no netto column', () => {
    const p = parseWeighList('Datum;Brutto;Tara\n2026-10-01;32 660;14 240\n');
    expect(p.rows[0].netto_kg).toBe(18420);
  });

  it('skips unreadable rows with a reason, and repeated headers silently', () => {
    const p = parseWeighList('Datum;Netto\n2026-10-01;18420\nokänt;17000\nDatum;Netto\n;16000\n2026-10-02;90000\n');
    expect(p.rows).toHaveLength(1);
    expect(p.skipped).toEqual([
      { line: 3, reason: 'Okänt datum "okänt"' },
      { line: 5, reason: 'Datum saknas' },
      { line: 6, reason: 'Orimlig vikt (90000 kg). Kontrollera enheten.' },
    ]);
  });

  it('flags ticket numbers that occur twice on the list', () => {
    const p = parseWeighList('Datum;Kvitto;Netto\n2026-10-01;A1001;18000\n2026-10-01;A-1001;18000\n2026-10-02;A1002;17000\n');
    expect(p.duplicates).toEqual(['A1001']);
  });

  it('uses the office\'s mapping when given, ignoring unknown fields and double-used columns', () => {
    const text = 'Dag;Vikt i ton;Bil\n2026-10-01;18,4;ABC123\n';
    const p = parseWeighList(text, { columns: { datum: 0, netto_kg: 1, regnr: 1, nonsense: 2 }, unit: 'ton' });
    expect(p.mapping).toEqual({ columns: { datum: 0, netto_kg: 1 }, unit: 'ton' });
    expect(p.rows[0]).toMatchObject({ datum: '2026-10-01', netto_kg: 18400, regnr: null });
    expect(sanitizeMapping({ columns: { datum: 9 } }, 3)).toEqual({ columns: {}, unit: 'kg' });
  });

  it('explains what is missing', () => {
    expect(() => parseWeighList('')).toThrow(WeighListError);
    expect(() => parseWeighList('hej\nhopp')).toThrow(/rubrikrad/);
    expect(() => parseWeighList('Datum;Regnr\n2026-10-01;ABC123')).toThrow(/nettovikt/);
    try {
      parseWeighList('Netto;Regnr;Kvitto\n18000;ABC123;1');
    } catch (err) {
      expect(err.code).toBe('no_date');
    }
  });
});
