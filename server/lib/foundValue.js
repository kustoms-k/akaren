import { stockholmDate } from './dates.js';

// Hittat värde: what Lasskoll has found that would otherwise never have been invoiced. Shown on Översikt and used
// for the pilot guarantee. Pure, and computed on every read from what the office did in Avstämning (nothing is
// stored), so it follows later corrections and invoicing:
//   - a lass created from a weighing-list row is a load that was weighed but never logged. It's worth its invoice
//     line once invoiced, and its estimate on the fakturaunderlag until then.
//   - a lass whose weight was corrected upwards from a weighing list is worth the extra weight. A correction
//     downwards found no money (it stopped a wrong invoice), so it is counted but not valued.
// Förlustkontroll is stateless (it runs on a prospect's files), so it never counts here.

/** The change reason Avstämning writes on a lass corrected from a weighing list, followed by the facility. */
export const WEIGH_LIST_FIX_REASON = 'Rättad enligt våglista';

const MAX_ITEMS = 200;

/**
 * created:     lass created from a weighing-list row:
 *              [{ lass_id, job_id, found_at, datum, vagsedel_nr, material, netto_kg, facility_name, customer_name,
 *                 project_name, invoiced_ore (null when not invoiced) }]
 * corrections: lass weights corrected from a weighing list:
 *              [{ lass_id, job_id, found_at, datum, vagsedel_nr, material, from_kg, to_kg, facility_name,
 *                 customer_name, project_name }]
 * valueOf(item, nettoKg): the lass's value in öre on the fakturaunderlag at that weight, or null when it can't be
 *              priced (no price, or the job is billed per hour or at a fixed price).
 * today:       local date; the month total counts from the first of today's month (Europe/Stockholm).
 * Returns { totals, items } with the newest finds first.
 */
export function foundValue({ created, corrections, valueOf, today }) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const common = (r) => ({
    lass_id: r.lass_id, found_at: r.found_at, found_date: stockholmDate(new Date(r.found_at)), datum: r.datum,
    vagsedel_nr: r.vagsedel_nr ?? null, facility_name: r.facility_name ?? null, customer_name: r.customer_name,
    project_name: r.project_name,
  });

  const items = [];
  for (const r of created) {
    const value = r.invoiced_ore ?? valueOf(r, r.netto_kg);
    items.push({ ...common(r), kind: 'lass', netto_kg: r.netto_kg ?? null, value_ore: value, invoiced: r.invoiced_ore != null });
  }
  for (const r of corrections) {
    const up = r.to_kg > r.from_kg;
    let value = 0;
    if (up) {
      const after = valueOf(r, r.to_kg);
      const before = valueOf(r, r.from_kg);
      value = after != null && before != null ? Math.max(0, after - before) : null;
    }
    items.push({ ...common(r), kind: up ? 'vikt_upp' : 'vikt_ned', from_kg: r.from_kg, to_kg: r.to_kg, value_ore: value });
  }
  items.sort((a, b) => b.found_at.localeCompare(a.found_at) || b.lass_id - a.lass_id);

  const sum = (list) => list.reduce((s, i) => s + (i.value_ore ?? 0), 0);
  const lass = items.filter((i) => i.kind === 'lass');
  const up = items.filter((i) => i.kind === 'vikt_upp');
  return {
    totals: {
      value_ore: sum(items),
      month_value_ore: sum(items.filter((i) => i.found_date >= monthStart)),
      lass: lass.length,
      lass_value_ore: sum(lass),
      // Found but not valued: the job is billed per hour or at a fixed price, or has no price.
      unpriced: items.filter((i) => i.value_ore == null).length,
      weight_up: up.length,
      weight_up_value_ore: sum(up),
      weight_down: items.filter((i) => i.kind === 'vikt_ned').length,
      first_found_at: items.at(-1)?.found_at ?? null,
    },
    items: items.slice(0, MAX_ITEMS),
  };
}
