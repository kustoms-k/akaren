// Massredovisning: where every lass of a project went. Pure helpers for the summary and the CSV export.

/**
 * Totals and a per-destination breakdown for a list of lass rows.
 * rows: lass_current-like objects with material, avfallskod, farligt_avfall, till_namn, netto_kg, review_status.
 */
export function summarize(rows) {
  const groups = new Map();
  const totals = { count: 0, netto_kg: 0, missing_weight: 0, farligt_avfall: 0, unreviewed: 0 };
  for (const r of rows) {
    totals.count++;
    if (r.netto_kg == null) totals.missing_weight++;
    else totals.netto_kg += r.netto_kg;
    if (r.farligt_avfall) totals.farligt_avfall++;
    if (r.review_status === 'behover_granskas') totals.unreviewed++;

    const key = JSON.stringify([r.material ?? '', r.avfallskod ?? '', Boolean(r.farligt_avfall), r.till_namn ?? '']);
    if (!groups.has(key)) {
      groups.set(key, {
        material: r.material ?? null, avfallskod: r.avfallskod ?? null, farligt_avfall: Boolean(r.farligt_avfall),
        till_namn: r.till_namn ?? null, count: 0, netto_kg: 0,
      });
    }
    const g = groups.get(key);
    g.count++;
    g.netto_kg += r.netto_kg ?? 0;
  }
  const summary = [...groups.values()].sort((a, b) => b.netto_kg - a.netto_kg || b.count - a.count);
  return { summary, totals };
}

const tonFmt = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false });
/** 18420 kg → '18,420'. Swedish Excel reads the comma as a decimal separator. */
export const kgToTonCell = (kg) => (kg == null ? '' : tonFmt.format(kg / 1000));

const REVIEW_LABELS = { ok: 'OK', behover_granskas: 'Ska granskas', granskad: 'Granskad' };

/**
 * One CSV cell. Text from drivers, tickets and AI is untrusted: anything Excel would run as a
 * formula is prefixed with an apostrophe, and cells with separators, quotes or newlines are quoted.
 */
export function csvCell(value) {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  ['Datum', (r) => r.datum],
  ['Tid', (r) => r.tid],
  ['Vågsedel', (r) => r.vagsedel_nr],
  ['Regnr', (r) => r.vehicle_regnr],
  ['Material', (r) => r.material],
  ['Avfallskod', (r) => r.avfallskod],
  ['Farligt avfall', (r) => (r.farligt_avfall ? 'Ja' : 'Nej')],
  ['Netto (ton)', (r) => kgToTonCell(r.netto_kg)],
  ['Från', (r) => r.fran_text],
  ['Till', (r) => r.till_namn],
  ['Mottagare org.nr', (r) => r.till_orgnr],
  ['Mottagare adress', (r) => r.till_adress],
  ['Rapporterad till avfallsregistret', (r) => r.hazard_reported_on],
  ['Status', (r) => REVIEW_LABELS[r.review_status] ?? r.review_status],
  ['Version', (r) => r.version],
];

/** UTF-8 CSV with BOM, ';' separators and CRLF line endings, as Swedish Excel expects. */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(';')];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** ASCII file-name part: 'Kv. Rörstrand – schakt' → 'kv-rorstrand-schakt'. */
export function fileSlug(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'projekt';
}
