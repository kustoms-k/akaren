import { isValidDate } from './dates.js';
import { normalizeRegnr } from './normalize.js';

// Reading a receiving facility's weighing list (våglista): a CSV export, or rows copied from Excel (tab separated).
// Pure. Every facility's scale system names its columns differently, so columns are recognised by Swedish header
// synonyms and the office confirms (or changes) the mapping before anything is imported.

export const FIELDS = ['datum', 'tid', 'vagsedel_nr', 'regnr', 'netto_kg', 'brutto_kg', 'tara_kg', 'material', 'referens', 'belopp'];

export const FIELD_LABELS = {
  datum: 'Datum',
  tid: 'Tid',
  vagsedel_nr: 'Vågsedelnummer',
  regnr: 'Regnr',
  netto_kg: 'Netto',
  brutto_kg: 'Brutto',
  tara_kg: 'Tara',
  material: 'Material',
  referens: 'Kund / märkning',
  belopp: 'Belopp (kr)',
};

export const MAX_ROWS = 5000;

/** Lowercase, å/ä/ö folded, punctuation as spaces. */
export const fold = (s) => String(s ?? '').toLowerCase()
  .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Folded header text → field. Exact matches first; then a header that starts with one of the prefixes.
const EXACT = {
  datum: ['datum', 'date', 'dag', 'vagningsdatum', 'datum ut', 'utdatum', 'transaktionsdatum', 'leveransdatum', 'datum tid', 'datum och tid', 'tidpunkt',
    'fakturadatum', 'utforandedatum', 'arbetsdatum'],
  tid: ['tid', 'klockslag', 'time', 'tid ut', 'uttid', 'kl'],
  vagsedel_nr: ['vagsedel', 'vagsedelnr', 'vagsedel nr', 'vagsedelnummer', 'kvitto', 'kvittonr', 'kvitto nr', 'kvittonummer',
    'sedel', 'sedelnr', 'sedel nr', 'vagnr', 'vag nr', 'vagningsnr', 'vagning nr', 'vagningsnummer', 'transaktion',
    'transaktionsnr', 'transaktions nr', 'lopnr', 'lopnummer', 'foljesedel', 'foljesedelnr', 'ticket', 'nr'],
  regnr: ['regnr', 'reg nr', 'registreringsnummer', 'registreringsnr', 'fordon', 'fordonsnr', 'bil', 'bilnr', 'lastbil',
    'ekipage', 'reg', 'regnummer', 'fordon regnr'],
  netto_kg: ['netto', 'nettovikt', 'netto kg', 'nettovikt kg', 'netto ton', 'netto t', 'nettovikt ton', 'vikt', 'vikt kg',
    'vikt ton', 'mangd', 'mangd kg', 'mangd ton', 'kvantitet', 'antal ton', 'ton', 'kg', 'antal', 'levererat antal',
    'levererad kvantitet'],
  brutto_kg: ['brutto', 'bruttovikt', 'brutto kg', 'brutto ton', 'bruttovikt kg'],
  tara_kg: ['tara', 'taravikt', 'tara kg', 'tara ton', 'taravikt kg'],
  material: ['material', 'artikel', 'artikelnamn', 'artikelbenamning', 'produkt', 'produktnamn', 'sort', 'fraktion',
    'benamning', 'massa', 'massatyp', 'materialtyp', 'avfallstyp', 'avfallsslag'],
  referens: ['kund', 'kundnamn', 'marke', 'markning', 'referens', 'er referens', 'projekt', 'projektnr', 'littera', 'arbetsplats',
    'kundreferens', 'ursprung', 'fran', 'beskrivning', 'text', 'radtext', 'specifikation'],
  // Invoice specifications: the row amount, excluding VAT.
  belopp: ['belopp', 'summa', 'totalt', 'total', 'belopp kr', 'belopp sek', 'belopp exkl moms', 'summa exkl moms', 'radbelopp',
    'nettobelopp', 'netto belopp', 'pris totalt', 'totalpris', 'radsumma'],
};
const LOOKUP = new Map(Object.entries(EXACT).flatMap(([field, names]) => names.map((n) => [n, field])));
const PREFIX = [
  ['vagsedel', 'vagsedel_nr'], ['kvitto', 'vagsedel_nr'], ['vagning', 'vagsedel_nr'],
  ['registrering', 'regnr'], ['nettovikt', 'netto_kg'], ['netto', 'netto_kg'],
  ['brutto', 'brutto_kg'], ['tara', 'tara_kg'], ['artikel', 'material'], ['material', 'material'], ['datum', 'datum'],
  ['belopp', 'belopp'],
];

/** The field a header names, or null. */
export function headerField(header) {
  const f = fold(header);
  if (!f) return null;
  if (LOOKUP.has(f)) return LOOKUP.get(f);
  const prefix = PREFIX.find(([p]) => f.startsWith(p));
  return prefix ? prefix[1] : null;
}

/** 'ton' when a weight header says so ('Netto (ton)', 'Vikt t'), 'kg' when it says kg, else null. */
export function headerUnit(header) {
  const f = fold(header);
  if (/\bkg\b/.test(f)) return 'kg';
  if (/\b(ton|t)\b/.test(f)) return 'ton';
  return null;
}

// ── Tokenising ──

/** The delimiter that splits the sample lines most consistently: tab, semicolon or comma. */
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = { d: ';', score: -1 };
  for (const d of ['\t', ';', ',']) {
    const counts = lines.map((l) => splitLine(l, d).length).filter((n) => n > 1);
    if (!counts.length) continue;
    // The most common column count, weighted by how many lines have it.
    const freq = new Map();
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
    const [cols, hits] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = hits * 100 + cols;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

/** One line split on `d`, honouring "quoted; fields" with "" as an escaped quote. */
function splitLine(line, d) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { quoted = true; cur = ''; } else if (ch === d) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Rows of cells, each with its 1-based line number. Blank lines are dropped. */
export function tokenize(text, delimiter = detectDelimiter(text)) {
  const clean = String(text ?? '').replace(/^﻿/, '');
  return clean.split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, cells: splitLine(line, delimiter) }))
    .filter((r) => r.cells.some((c) => c !== ''));
}

// ── Values ──

/**
 * A date (and maybe a time) as written on Swedish weighing lists:
 * 2026-10-05, 2026-10-05 07:12, 20261005, 05.10.2026, 5/10/2026, 05-10-2026, 5/10-26.
 * Returns { datum, tid } or null.
 */
export function parseDateTime(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const timeOf = (rest) => {
    const t = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?/.exec(rest ?? '');
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
    return `${pad(t[1])}:${t[2]}`;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.*))?$/.exec(s);
  let datum = null;
  let rest = null;
  if (m) {
    datum = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    rest = m[4];
  } else if ((m = /^(\d{4})(\d{2})(\d{2})(?:[ T](.*))?$/.exec(s))) {
    datum = `${m[1]}-${m[2]}-${m[3]}`;
    rest = m[4];
  } else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:[ T,]+(.*))?$/.exec(s))) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    datum = `${year}-${pad(m[2])}-${pad(m[1])}`;
    rest = m[4];
  }
  if (!datum || !isValidDate(datum)) return null;
  return { datum, tid: timeOf(rest) };
}

/** A time cell: '07:12', '7.12', '07:12:44', or a timestamp ending in a time. */
export function parseTime(raw) {
  const s = String(raw ?? '').trim();
  const m = /(?:^|\s|T)(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * A number as written in Sweden or by a scale export: '18 420', '18420', '18,42', '18.42', '18.420' (kg with a
 * thousands dot), '1 234,5'. Returns a Number, or null for blank/garbage.
 * unit: 'kg' lets '18.420' mean 18420; 'ton' makes it 18.42.
 */
export function parseNumber(raw, unit = null) {
  let s = String(raw ?? '').trim().replace(/[\s  ]/g, '').replace(/(kg|ton|t)$/i, '');
  if (!s || !/^-?[\d.,]+$/.test(s)) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // The last separator is the decimal one.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) && unit === 'kg' ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s) && unit === 'kg') {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** kg from a weight cell in `unit`. Null when blank, not a number, or not positive. */
export function toKg(raw, unit) {
  const n = parseNumber(raw, unit);
  if (n == null || n <= 0) return null;
  return Math.round(unit === 'ton' ? n * 1000 : n);
}

/** A ticket number as compared: letters and digits only, uppercase. */
export const ticketKey = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

/** The digits of a ticket number without leading zeros, when there are enough of them to identify a ticket. */
export function ticketDigits(s) {
  const d = String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return d.length >= 4 ? d : null;
}

/** A regnr as compared: normalised when valid, else uppercase letters and digits. */
export const regnrKey = (s) => normalizeRegnr(s) ?? (String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null);

// ── Header and mapping ──

/**
 * Find the header row: the first of the first 15 rows naming at least two known fields, one of them a date or a
 * weight. Lists often start with a title, the facility's address and the period.
 */
export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const fields = rows[i].cells.map(headerField).filter(Boolean);
    const set = new Set(fields);
    if (set.size >= 2 && (set.has('datum') || set.has('netto_kg') || set.has('brutto_kg') || set.has('belopp'))) return i;
  }
  return -1;
}

/**
 * Suggested mapping for a header row: { columns: { field: index }, unit: 'kg'|'ton' }.
 * A field taken by an earlier column isn't taken again ('Netto' before 'Vikt'). 'nr' alone only counts as the
 * ticket number when nothing better is there.
 */
export function suggestMapping(headers, sampleRows = []) {
  const columns = {};
  const weak = [];
  headers.forEach((h, i) => {
    const field = headerField(h);
    if (!field) return;
    if (field === 'vagsedel_nr' && fold(h) === 'nr') { weak.push(i); return; }
    if (columns[field] == null) columns[field] = i;
  });
  if (columns.vagsedel_nr == null && weak.length) columns.vagsedel_nr = weak[0];
  return { columns, unit: guessUnit(headers, columns, sampleRows) };
}

/**
 * kg or ton: from the weight header, else from the values. A truck load is 2–40 t, so a typical (median) value
 * under 100 is tonnes and anything larger is kilograms.
 */
export function guessUnit(headers, columns, sampleRows = []) {
  const col = columns.netto_kg ?? columns.brutto_kg;
  if (col == null) return 'kg';
  const fromHeader = headerUnit(headers[col]);
  if (fromHeader) return fromHeader;
  const values = sampleRows.map((r) => parseNumber(r.cells[col])).filter((n) => n != null && n > 0);
  if (!values.length) return 'kg';
  const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return median < 100 ? 'ton' : 'kg';
}

// ── Rows ──

/**
 * One data row → { line, datum, tid, vagsedel_nr, regnr, netto_kg, material, referens } or { line, error }.
 * Netto comes from the netto column, else brutto − tara.
 */
export function readRow({ line, cells }, { columns, unit }) {
  const cell = (f) => (columns[f] == null ? '' : String(cells[columns[f]] ?? '').trim());
  const dt = parseDateTime(cell('datum'));
  if (!dt) return { line, error: cell('datum') ? `Okänt datum "${cell('datum').slice(0, 30)}"` : 'Datum saknas' };
  const tid = (columns.tid != null ? parseTime(cell('tid')) : null) ?? dt.tid;
  let netto = toKg(cell('netto_kg'), unit);
  if (netto == null && columns.brutto_kg != null && columns.tara_kg != null) {
    const brutto = toKg(cell('brutto_kg'), unit);
    const tara = toKg(cell('tara_kg'), unit);
    if (brutto != null && tara != null && brutto > tara) netto = brutto - tara;
  }
  if (netto != null && netto > 80_000) return { line, error: `Orimlig vikt (${netto} kg). Kontrollera enheten.` };
  const text = (f, max) => cell(f).replace(/\s+/g, ' ').slice(0, max) || null;
  const regnrRaw = text('regnr', 20);
  const row = {
    line,
    datum: dt.datum,
    tid,
    vagsedel_nr: text('vagsedel_nr', 40),
    regnr: regnrRaw ? regnrKey(regnrRaw) : null,
    netto_kg: netto,
    material: text('material', 120),
    referens: text('referens', 120),
  };
  if (columns.belopp != null) {
    const kr = parseNumber(cell('belopp'));
    row.belopp_ore = kr == null ? null : Math.round(kr * 100);
  }
  return row;
}

/** Rows that look like totals or page breaks rather than weighings. */
const isSummaryRow = (cells) => /^(summa|totalt?|total|delsumma|antal|sida \d)/i.test(cells.find((c) => c) ?? '');

/**
 * Parse a whole list. mapping: { columns, unit } to use (the office's choice); omit it to use the suggestion.
 * kind: 'vaglista' (default; needs a weight) or 'faktura' (an invoice specification: needs a date and a weight,
 * an amount or a ticket number).
 * Returns {
 *   delimiter, headerIndex, headers, mapping, rows: [parsed], skipped: [{ line, reason }],
 *   period: { from, to } | null, duplicates: [ticket keys seen more than once]
 * }
 * Throws WeighListError when there is no recognisable header or no date column.
 */
export function parseWeighList(text, mapping = null, { kind = 'vaglista' } = {}) {
  const all = tokenize(text);
  if (!all.length) throw new WeighListError('empty', 'Listan är tom.');
  const headerIndex = findHeader(all);
  if (headerIndex < 0 && !mapping) {
    throw new WeighListError('no_header', 'Hittade ingen rubrikrad med t.ex. Datum och Netto. Ta med rubrikraden när du kopierar.');
  }
  const headers = headerIndex >= 0 ? all[headerIndex].cells : all[0].cells.map((_, i) => `Kolumn ${i + 1}`);
  const data = all.slice(headerIndex + 1);
  const used = mapping ? sanitizeMapping(mapping, headers.length) : suggestMapping(headers, data.slice(0, 50));
  if (used.columns.datum == null) throw new WeighListError('no_date', 'Välj vilken kolumn som är datum.');
  const hasWeight = used.columns.netto_kg != null || (used.columns.brutto_kg != null && used.columns.tara_kg != null);
  if (kind === 'faktura') {
    if (!hasWeight && used.columns.belopp == null && used.columns.vagsedel_nr == null) {
      throw new WeighListError('no_weight', 'Välj minst en kolumn för antal ton, belopp eller vågsedelnummer.');
    }
  } else if (!hasWeight) {
    throw new WeighListError('no_weight', 'Välj vilken kolumn som är nettovikt (eller brutto och tara).');
  }
  if (data.length > MAX_ROWS) throw new WeighListError('too_many', `Listan har för många rader (högst ${MAX_ROWS}). Dela upp den per månad.`);

  const rows = [];
  const skipped = [];
  for (const r of data) {
    if (isSummaryRow(r.cells)) continue;
    // A repeated header (multi-page exports) is not a weighing.
    if (r.cells.map(headerField).filter(Boolean).length >= 2) continue;
    const parsed = readRow(r, used);
    if (parsed.error) skipped.push({ line: parsed.line, reason: parsed.error });
    else rows.push(parsed);
  }
  const dates = rows.map((r) => r.datum).sort();
  const seen = new Map();
  for (const r of rows) {
    const k = ticketKey(r.vagsedel_nr);
    if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return {
    delimiter: detectDelimiter(text),
    headerIndex,
    headers,
    mapping: used,
    rows,
    skipped,
    period: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
    duplicates: [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  };
}

// When two fields claim the same column, the one the reconciliation depends on most keeps it.
const PRIORITY = ['datum', 'netto_kg', 'brutto_kg', 'tara_kg', 'vagsedel_nr', 'regnr', 'belopp', 'tid', 'material', 'referens'];

/** Keep only known fields pointing at existing columns, each column used once. */
export function sanitizeMapping(mapping, columnCount) {
  const columns = {};
  const taken = new Set();
  for (const f of PRIORITY) {
    const i = mapping?.columns?.[f];
    if (Number.isInteger(i) && i >= 0 && i < columnCount && !taken.has(i)) {
      columns[f] = i;
      taken.add(i);
    }
  }
  return { columns, unit: mapping?.unit === 'ton' ? 'ton' : 'kg' };
}

export class WeighListError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * What the import dialog shows: the suggested (or given) mapping, the first rows and what was skipped. When the
 * columns can't be mapped yet, the headers and a few raw rows come back with `error`, so the office can map by hand.
 * Throws WeighListError only for an empty or oversized list.
 */
export function previewWeighList(text, mapping = null, { kind = 'vaglista' } = {}) {
  try {
    const parsed = parseWeighList(text, mapping, { kind });
    return {
      headers: parsed.headers, mapping: parsed.mapping, labels: FIELD_LABELS, rows: parsed.rows.slice(0, 12),
      row_count: parsed.rows.length, skipped: parsed.skipped.slice(0, 50), skipped_count: parsed.skipped.length,
      period: parsed.period, duplicates: parsed.duplicates, error: null,
    };
  } catch (err) {
    if (!(err instanceof WeighListError) || err.code === 'empty' || err.code === 'too_many') throw err;
    const all = tokenize(text);
    const headerIndex = findHeader(all);
    const width = Math.max(...all.slice(0, 15).map((r) => r.cells.length));
    const headers = headerIndex >= 0 ? all[headerIndex].cells : Array.from({ length: width }, (_, i) => `Kolumn ${i + 1}`);
    return {
      headers, mapping: mapping ? sanitizeMapping(mapping, headers.length) : suggestMapping(headers), labels: FIELD_LABELS,
      rows: [], row_count: 0, skipped: [], skipped_count: 0, period: null, duplicates: [],
      error: err.message, sample: all.slice(headerIndex + 1, headerIndex + 6).map((r) => r.cells),
    };
  }
}
