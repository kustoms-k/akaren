import { isoWeek } from './dates.js';
import { reconcile } from './reconcile.js';

// Förlustkontroll: a facility's weighing list against the company's invoice specification. Every weighing should be
// on an invoice; the ones that aren't are loads that were driven and never paid for. Pure, and nothing is stored:
// it works on a prospect's files before they are a customer, as well as on a customer's.

// Invoice rows often hold the ticket number in the description ("EKB418297 5/10 Schaktmassor"). A ticket is 5–8
// digits with an optional short letter prefix; dates (20261005) and org numbers (559101-2348) are not tickets.
const TICKET_IN_TEXT = /(?:^|[^\p{L}\d])((?:\p{Lu}{1,4}[- ]?)?\d{5,8})(?![\d-])/gu;

/** The ticket number in free text, or null. A prefixed ticket wins over bare digits. */
export function ticketInText(...texts) {
  const found = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of String(t).toUpperCase().matchAll(TICKET_IN_TEXT)) {
      const token = m[1].replace(/\s/g, '');
      const digits = token.replace(/\D/g, '');
      if (/^20\d{6}$/.test(digits) && !/[A-Z]/.test(token)) continue;      // a date
      found.push(token);
    }
  }
  return found.find((t) => /[A-Z]/.test(t)) ?? found[0] ?? null;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * The price to value a missing load with: what the office typed, else what the invoices themselves say
 * (amount per tonne over the rows with both, or the typical amount per row when they have no weights).
 * Returns { unit: 'ton'|'lass', ore, source: 'angivet'|'fakturor' } or null.
 */
export function chosenPrice(invoiceRows, { priceTonOre = null, priceLassOre = null } = {}) {
  if (priceTonOre) return { unit: 'ton', ore: priceTonOre, source: 'angivet' };
  if (priceLassOre) return { unit: 'lass', ore: priceLassOre, source: 'angivet' };
  const weighed = invoiceRows.filter((r) => r.netto_kg && r.belopp_ore > 0);
  const kg = weighed.reduce((s, r) => s + r.netto_kg, 0);
  if (kg > 0) return { unit: 'ton', ore: Math.round((weighed.reduce((s, r) => s + r.belopp_ore, 0) * 1000) / kg), source: 'fakturor' };
  const amounts = invoiceRows.map((r) => r.belopp_ore).filter((a) => a > 0);
  return amounts.length ? { unit: 'lass', ore: median(amounts), source: 'fakturor' } : null;
}

const valueOf = (price, kg) => {
  if (!price) return null;
  if (price.unit === 'lass') return price.ore;
  return kg == null ? null : Math.round((price.ore * kg) / 1000);
};

/**
 * weighRows / invoiceRows: parsed rows (lib/weighList.js), the invoice rows read with kind 'faktura'.
 * facility: { name, orgnr }. prices: { priceTonOre, priceLassOre } typed by the office, both optional.
 * Returns { missing, differences, weeks, price, totals }.
 */
export function lossCheck({ weighRows, invoiceRows, facility, prices = {} }) {
  const invoices = invoiceRows.map((r, i) => ({
    lass_id: i + 1, line: r.line, datum: r.datum, tid: r.tid ?? null,
    vagsedel_nr: r.vagsedel_nr ?? ticketInText(r.material, r.referens),
    vehicle_regnr: r.regnr ?? null, netto_kg: r.netto_kg ?? null, belopp_ore: r.belopp_ore ?? null,
    description: [r.material, r.referens].filter(Boolean).join(' · ') || null,
    till_namn: null, till_orgnr: null,
  }));
  const rows = weighRows.map((r, i) => ({ ...r, id: i + 1, line_no: r.line, resolution: null, resolved_lass_id: null }));
  const dates = rows.map((r) => r.datum).sort();
  const period = { from: dates[0] ?? '0000-00-00', to: dates.at(-1) ?? '0000-00-00' };
  // Invoices can be dated long after the load, and their rows carry neither the truck nor the facility.
  const result = reconcile({ rows, lass: invoices, facility, period, options: { ticketDays: 120, digitsAnywhere: true } });
  const price = chosenPrice(invoiceRows, prices);

  const missing = result.rows.filter((r) => r.status === 'saknas').map((r) => ({
    line: r.line_no, datum: r.datum, tid: r.tid, vagsedel_nr: r.vagsedel_nr, regnr: r.regnr, netto_kg: r.netto_kg,
    material: r.material, referens: r.referens, value_ore: valueOf(price, r.netto_kg),
  }));
  // Loads invoiced at a lower weight than the scale weighed: the difference was never billed.
  const differences = result.rows
    .filter((r) => r.match)
    .flatMap((r) => {
      const d = r.differences.find((x) => x.field === 'netto_kg' && x.lass != null && x.list > x.lass);
      if (!d || price?.unit !== 'ton') return [];
      return [{
        line: r.line_no, datum: r.datum, vagsedel_nr: r.vagsedel_nr, regnr: r.regnr,
        weighed_kg: d.list, invoiced_kg: d.lass, diff_kg: d.list - d.lass, value_ore: valueOf(price, d.list - d.lass),
        invoice_line: r.lass.line, invoice_text: r.lass.description,
      }];
    });

  // Week by week: weighed against invoiced. Works even when the invoices are one summary row per week.
  const weeks = new Map();
  const week = (key) => {
    if (!weeks.has(key)) weeks.set(key, { week: key, weighed: 0, weighed_kg: 0, invoiced: 0, invoiced_kg: 0, invoiced_ore: 0, missing: 0 });
    return weeks.get(key);
  };
  for (const r of rows) {
    const w = week(isoWeek(r.datum).key);
    w.weighed++;
    w.weighed_kg += r.netto_kg ?? 0;
  }
  for (const r of result.rows) if (r.status === 'saknas') week(isoWeek(r.datum).key).missing++;
  // An invoice row counts in the week of the load it matched (invoices are dated after the work);
  // unmatched rows count in their own week when that is inside the list's period.
  const loadDate = new Map(result.rows.filter((r) => r.match).map((r) => [r.match.lass_id, r.datum]));
  for (const inv of invoices) {
    const datum = loadDate.get(inv.lass_id) ?? inv.datum;
    if (datum < period.from || datum > period.to) continue;
    const w = week(isoWeek(datum).key);
    w.invoiced++;
    w.invoiced_kg += inv.netto_kg ?? 0;
    w.invoiced_ore += inv.belopp_ore ?? 0;
  }

  const sum = (list, f) => list.reduce((s, x) => s + (f(x) ?? 0), 0);
  const missingValue = sum(missing, (m) => m.value_ore);
  const diffValue = sum(differences, (d) => d.value_ore);
  return {
    period,
    missing,
    differences,
    weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    price,
    totals: {
      weighed: rows.length,
      weighed_kg: sum(rows, (r) => r.netto_kg),
      matched: result.rows.filter((r) => r.match).length,
      matched_by_ticket: result.rows.filter((r) => r.match?.kind === 'vagsedel').length,
      missing: missing.length,
      missing_kg: sum(missing, (m) => m.netto_kg),
      missing_value_ore: missingValue,
      diff_kg: sum(differences, (d) => d.diff_kg),
      diff_value_ore: diffValue,
      total_value_ore: missingValue + diffValue,
      invoice_rows: invoices.length,
      invoice_rows_unmatched: invoices.length - result.rows.filter((r) => r.match).length,
    },
  };
}
