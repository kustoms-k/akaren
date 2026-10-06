import { lineAmount, listsFor, resolvePrice } from './pricing.js';
import { fold, regnrKey, ticketDigits, ticketKey } from './weighList.js';

// Avstämning: match a facility's weighing list against the logged lass. Pure.
//
// The facility's scale is the source of truth for what was tipped there. A weighing with no lass is a load that
// will never be invoiced unless someone logs it; a lass whose weight differs from the scale is invoiced wrong.
//
// Matching, strongest first. Each lass matches at most one row and each row at most one lass.
//   0. 'skapad'      the office created the lass from this row
//   1. 'vagsedel'    same ticket number (letters and digits), within ±3 days
//   2. 'vagsedel'    same ticket digits (lists often drop the prefix: 418233 for EKB418233), within ±3 days,
//                    and the lass went to this facility or was driven by the same truck
//   3. 'fordon_dag'  same truck and day, paired by closest weight and time; accepted when the weight or the time
//                    agrees, or when it is the only unmatched lass and weighing of that truck and day at this facility

export const WEIGHT_TOLERANCE_KG = 10;          // tonnes with two decimals on the list = 10 kg precision
const TICKET_DAYS = 3;
const PAIR_WEIGHT_KG = (kg) => Math.max(60, Math.round(kg * 0.015));
const PAIR_MINUTES = 20;

export const ROW_STATUS = ['matchad', 'avvikelse', 'saknas', 'ignorerad'];

// Words that say what kind of place it is rather than which one.
const GENERIC = new Set(['ab', 'hb', 'kb', 'aktiebolag', 'mottagning', 'massmottagning', 'mottagningsanlaggning', 'atervinning',
  'atervinningscentral', 'deponi', 'tipp', 'tippen', 'bergtakt', 'takt', 'grustag', 'kross', 'center', 'centrum', 'anlaggning',
  'avfallsanlaggning', 'miljo', 'sverige', 'och', 'massor', 'jord', 'sten', 'grus', 'the']);
const words = (s) => fold(s).split(' ').filter((w) => w.length >= 3 && !GENERIC.has(w));

/** Did this lass go to the facility? By org nr when both have one, else by a distinctive word in the name. */
export function facilityMatches(lass, facility) {
  if (lass.till_orgnr && facility.orgnr) return lass.till_orgnr === facility.orgnr;
  const a = words(lass.till_namn);
  const b = new Set(words(facility.name));
  return a.length > 0 && a.some((w) => b.has(w));
}

const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const minutes = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

/** What differs between a weighing and its lass: [{ field, list, lass }]. */
export function differences(row, lass) {
  const out = [];
  if (row.netto_kg != null && (lass.netto_kg == null || Math.abs(row.netto_kg - lass.netto_kg) > WEIGHT_TOLERANCE_KG)) {
    out.push({ field: 'netto_kg', list: row.netto_kg, lass: lass.netto_kg ?? null });
  }
  if (row.vagsedel_nr) {
    const same = ticketKey(row.vagsedel_nr) === ticketKey(lass.vagsedel_nr)
      || (ticketDigits(row.vagsedel_nr) && ticketDigits(row.vagsedel_nr) === ticketDigits(lass.vagsedel_nr));
    if (!same) out.push({ field: 'vagsedel_nr', list: row.vagsedel_nr, lass: lass.vagsedel_nr ?? null });
  }
  if (row.datum !== lass.datum) out.push({ field: 'datum', list: row.datum, lass: lass.datum });
  if (row.regnr && lass.vehicle_regnr && regnrKey(lass.vehicle_regnr) !== row.regnr) {
    out.push({ field: 'regnr', list: row.regnr, lass: lass.vehicle_regnr });
  }
  return out;
}

/** The differences the office can correct on the lass from the list (the truck is not a lass field). */
export const FIXABLE = ['netto_kg', 'vagsedel_nr', 'datum'];

/**
 * rows:     weigh_list_rows of one list [{ id, line_no, datum, tid, vagsedel_nr, regnr, netto_kg, material, referens,
 *           resolution, resolution_note, resolved_lass_id }]
 * lass:     current lass that could be on it (the company's lass around the period)
 *           [{ lass_id, datum, tid, vagsedel_nr, vehicle_regnr, netto_kg, till_namn, till_orgnr, ... }]
 * facility: { name, orgnr }
 * period:   { from, to } (the list's period; lass to the facility inside it should be on the list)
 * options:  ticketDays: how far apart a ticket's dates may be (an invoice row can be dated weeks after the load);
 *           digitsAnywhere: match ticket digits without the facility/truck check (invoice rows carry neither).
 * Returns { rows: [row + { status, match: { lass_id, kind } | null, differences }], unlisted: [lass], totals }.
 */
export function reconcile({ rows, lass, facility, period, options = {} }) {
  const { ticketDays = TICKET_DAYS, digitsAnywhere = false } = options;
  const byId = new Map(lass.map((l) => [l.lass_id, l]));
  const used = new Set();
  const matchOf = new Map();          // row id → { lass, kind }
  const take = (row, l, kind) => {
    used.add(l.lass_id);
    matchOf.set(row.id, { lass: l, kind });
  };
  const toFacility = (l) => facilityMatches(l, facility);

  // 0. Created from the row.
  for (const r of rows) {
    const l = r.resolved_lass_id ? byId.get(r.resolved_lass_id) : null;
    if (l && !used.has(l.lass_id)) take(r, l, 'skapad');
  }

  // 1–2. Ticket number, exact then by digits.
  const index = (keyFn) => {
    const m = new Map();
    for (const l of lass) {
      const k = keyFn(l.vagsedel_nr);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    }
    return m;
  };
  const exact = index(ticketKey);
  const digits = index(ticketDigits);
  const closest = (row, candidates) => candidates
    .filter((l) => !used.has(l.lass_id) && Math.abs(dayDiff(row.datum, l.datum)) <= ticketDays)
    .sort((a, b) => Math.abs(dayDiff(row.datum, a.datum)) - Math.abs(dayDiff(row.datum, b.datum)) || a.lass_id - b.lass_id)[0];
  for (const r of rows) {
    if (matchOf.has(r.id) || !r.vagsedel_nr) continue;
    const l = closest(r, exact.get(ticketKey(r.vagsedel_nr)) ?? []);
    if (l) take(r, l, 'vagsedel');
  }
  for (const r of rows) {
    if (matchOf.has(r.id) || !ticketDigits(r.vagsedel_nr)) continue;
    const candidates = (digits.get(ticketDigits(r.vagsedel_nr)) ?? [])
      .filter((l) => digitsAnywhere || toFacility(l) || (r.regnr && regnrKey(l.vehicle_regnr) === r.regnr));
    const l = closest(r, candidates);
    if (l) take(r, l, 'vagsedel');
  }

  // 3. Same truck and day.
  const groups = new Map();
  const key = (regnr, datum) => `${regnr}|${datum}`;
  for (const r of rows) {
    if (matchOf.has(r.id) || !r.regnr) continue;
    const k = key(r.regnr, r.datum);
    if (!groups.has(k)) groups.set(k, { rows: [], lass: [] });
    groups.get(k).rows.push(r);
  }
  for (const l of lass) {
    if (used.has(l.lass_id)) continue;
    const g = groups.get(key(regnrKey(l.vehicle_regnr), l.datum));
    // A lass to another facility, with a ticket of its own, is that facility's weighing.
    if (g && (toFacility(l) || !l.till_namn)) g.lass.push(l);
  }
  for (const g of groups.values()) {
    const pairs = [];
    for (const r of g.rows) {
      for (const l of g.lass) {
        const dw = r.netto_kg != null && l.netto_kg != null ? Math.abs(r.netto_kg - l.netto_kg) : null;
        const dt = minutes(r.tid) != null && minutes(l.tid) != null ? Math.abs(minutes(r.tid) - minutes(l.tid)) : null;
        const weightOk = dw != null && dw <= PAIR_WEIGHT_KG(r.netto_kg);
        const timeOk = dt != null && dt <= PAIR_MINUTES;
        const onlyPair = g.rows.length === 1 && g.lass.length === 1;
        if (!weightOk && !timeOk && !onlyPair) continue;
        // Lower is better: weight agreement dominates, then time.
        const cost = (weightOk ? 0 : 1_000_000) + (dw ?? 50_000) + (dt ?? 120) * 10;
        pairs.push({ r, l, cost });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost || a.r.line_no - b.r.line_no || a.l.lass_id - b.l.lass_id);
    for (const { r, l } of pairs) {
      if (matchOf.has(r.id) || used.has(l.lass_id)) continue;
      take(r, l, 'fordon_dag');
    }
  }

  const out = rows.map((r) => {
    const m = matchOf.get(r.id);
    if (!m) {
      return { ...r, status: r.resolution === 'ignorerad' ? 'ignorerad' : 'saknas', match: null, differences: [] };
    }
    const diffs = differences(r, m.lass);
    return {
      ...r,
      status: diffs.length ? 'avvikelse' : 'matchad',
      match: { lass_id: m.lass.lass_id, kind: m.kind },
      lass: m.lass,
      differences: diffs,
    };
  });

  const unlisted = lass
    .filter((l) => !used.has(l.lass_id) && l.datum >= period.from && l.datum <= period.to && toFacility(l))
    .sort((a, b) => a.datum.localeCompare(b.datum) || String(a.tid ?? '').localeCompare(String(b.tid ?? '')) || a.lass_id - b.lass_id);

  const count = (s) => out.filter((r) => r.status === s).length;
  const sumKg = (list) => list.reduce((s, r) => s + (r.netto_kg ?? 0), 0);
  const missing = out.filter((r) => r.status === 'saknas');
  const weightDiffs = out.flatMap((r) => r.differences.filter((d) => d.field === 'netto_kg' && d.lass != null));
  return {
    rows: out,
    unlisted,
    totals: {
      rows: out.length,
      matchad: count('matchad'),
      avvikelse: count('avvikelse'),
      saknas: missing.length,
      ignorerad: count('ignorerad'),
      unlisted: unlisted.length,
      list_kg: sumKg(out),
      saknas_kg: sumKg(missing),
      // Scale minus logged, over matched lass whose weight differs: positive = under-invoiced weight.
      weight_diff_kg: weightDiffs.reduce((s, d) => s + (d.list - d.lass), 0),
    },
  };
}

/**
 * What a weighing would be worth on the fakturaunderlag if it were logged on `job`.
 * Mirrors buildUnderlag: a job billed per hour or at a fixed price doesn't bill its lass.
 * Returns { unit, price_ore, amount_ore, price_source, note } where amount_ore is null when it can't be priced.
 */
export function estimateValue({ job, customer, project, priceLists, material = null, nettoKg = null }) {
  const lists = listsFor(priceLists, { projectListId: project?.price_list_id ?? null, customerListId: customer?.price_list_id ?? null });
  const basis = resolvePrice(lists, { uppdragstyp: job.uppdragstyp, material: job.material })?.item.unit ?? null;
  if (basis === 'timme') return { unit: 'timme', price_ore: null, amount_ore: null, price_source: null, note: 'Ingår i timdebiteringen' };
  if (basis === 'fast') return { unit: 'fast', price_ore: null, amount_ore: null, price_source: null, note: 'Ingår i det fasta priset' };
  const price = resolvePrice(lists, { uppdragstyp: job.uppdragstyp, material: material ?? job.material, units: ['ton', 'lass'] });
  if (!price) return { unit: null, price_ore: null, amount_ore: null, price_source: null, note: 'Pris saknas' };
  const amount = lineAmount(price.item.unit, price.item.price_ore, { nettoKg });
  return {
    unit: price.item.unit,
    price_ore: price.item.price_ore,
    amount_ore: amount,
    price_source: price.list.name,
    note: amount == null ? 'Vikt saknas' : null,
  };
}

/**
 * Which of a truck's jobs that day a weighing most likely belongs to: the assignment whose lass that day went to
 * this facility most often, then the earliest. assignments: [{ id, job_id, lass_to_facility }].
 */
export function suggestAssignment(assignments) {
  return [...assignments].sort((a, b) => (b.lass_to_facility ?? 0) - (a.lass_to_facility ?? 0) || a.id - b.id)[0] ?? null;
}
