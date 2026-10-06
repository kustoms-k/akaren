import { lineAmount, lineQuantity, listsFor, resolvePrice, vatFor } from './pricing.js';

// The weekly fakturaunderlag: what to invoice per customer + project (decision D12), built from the week's
// lass, hours and fixed-price jobs. Pure: the route loads the rows, this decides prices, blockers and status.

export const BLOCKERS = {
  granskas: 'Ska granskas',
  pris_saknas: 'Pris saknas',
  vikt_saknas: 'Vikt saknas',
  timmar_saknas: 'Timmar saknas',
};

const TYPE_TEXT = {
  schakt: 'Schakt', grus_leverans: 'Leverans', kran: 'Kranbil', container: 'Container', maskintransport: 'Maskintransport', ovrigt: 'Transport',
};

const dm = (date) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
const ton = (kg) => `${(kg / 1000).toFixed(2).replace('.', ',')} t`;

/**
 * input: {
 *   week, from, to, companyVatMode,
 *   lass: lass_current rows in the week, joined with the job: { lass_id, version, customer_id, project_id, job_id,
 *         datum, tid, vagsedel_nr, vehicle_regnr, material, netto_kg, till_namn, review_status, driver_name,
 *         job_uppdragstyp, job_material },
 *   hours: assignment days in the week: { assignment_id, job_id, datum, regnr, driver_name, timmar (null = none) },
 *   jobs: [{ id, customer_id, project_id, uppdragstyp, material, datum_fran, status }] (every job referenced, plus
 *         jobs starting in the week),
 *   customers: [{ id, name, org_nr, fortnox_customer_nr, vat_mode, price_list_id }],
 *   projects: [{ id, customer_id, name, customer_ref, price_list_id }],
 *   priceLists: [{ id, name, is_default, items }],
 *   invoiced: { lass: Map(lass_id → batch), hours: Map('assignmentId|datum' → batch), jobs: Map(job_id → batch) },
 * }
 * Returns { week, from, to, groups, totals }.
 */
export function buildUnderlag(input) {
  const { week, from, to, companyVatMode } = input;
  const customers = new Map(input.customers.map((c) => [c.id, c]));
  const projects = new Map(input.projects.map((p) => [p.id, p]));
  const jobs = new Map(input.jobs.map((j) => [j.id, j]));
  const groups = new Map();

  const listsOf = (customerId, projectId) => listsFor(input.priceLists, {
    projectListId: projects.get(projectId)?.price_list_id ?? null,
    customerListId: customers.get(customerId)?.price_list_id ?? null,
  });
  // How a job is billed: by the unit of the price that applies to the job as a whole.
  const basisCache = new Map();
  const basisOf = (job) => {
    if (!basisCache.has(job.id)) {
      basisCache.set(job.id, resolvePrice(listsOf(job.customer_id, job.project_id), { uppdragstyp: job.uppdragstyp, material: job.material })?.item.unit ?? null);
    }
    return basisCache.get(job.id);
  };
  const groupFor = (customerId, projectId) => {
    const key = `${customerId}|${projectId}`;
    if (!groups.has(key)) {
      const c = customers.get(customerId);
      const p = projects.get(projectId);
      groups.set(key, {
        key,
        customer: { id: c.id, name: c.name, org_nr: c.org_nr ?? null, fortnox_customer_nr: c.fortnox_customer_nr ?? null },
        project: { id: p.id, name: p.name, customer_ref: p.customer_ref ?? null },
        vat_mode: c.vat_mode ?? companyVatMode,
        rows: [],
      });
    }
    return groups.get(key);
  };

  // ── Lass, priced per ton or per load ──
  for (const l of input.lass) {
    const job = jobs.get(l.job_id);
    if (!job || job.status === 'avbruten') continue;
    const basis = basisOf(job);
    if (basis === 'timme' || basis === 'fast') continue;            // covered by hours or the fixed price
    const price = resolvePrice(listsOf(l.customer_id, l.project_id), { uppdragstyp: job.uppdragstyp, material: l.material ?? job.material, units: ['ton', 'lass'] });
    const blockers = [];
    if (l.review_status === 'behover_granskas') blockers.push('granskas');
    if (!price) blockers.push('pris_saknas');
    if (price?.item.unit === 'ton' && l.netto_kg == null) blockers.push('vikt_saknas');
    const unit = price?.item.unit ?? 'lass';
    groupFor(l.customer_id, l.project_id).rows.push({
      key: `lass:${l.lass_id}`,
      kind: 'lass',
      lass_id: l.lass_id,
      lass_version: l.version,
      job_id: l.job_id,
      datum: l.datum,
      tid: l.tid ?? null,
      description: `${l.vagsedel_nr ?? 'Utan vågsedel'} ${dm(l.datum)} ${l.material ?? job.material ?? TYPE_TEXT[job.uppdragstyp]}`,
      detail: [l.vehicle_regnr, l.till_namn, l.netto_kg != null && ton(l.netto_kg)].filter(Boolean).join(' · '),
      vagsedel_nr: l.vagsedel_nr ?? null,
      regnr: l.vehicle_regnr ?? null,
      material: l.material ?? null,
      netto_kg: l.netto_kg ?? null,
      unit,
      quantity: price ? lineQuantity(unit, { nettoKg: l.netto_kg }) : null,
      price_ore: price?.item.price_ore ?? null,
      amount_ore: price ? lineAmount(unit, price.item.price_ore, { nettoKg: l.netto_kg }) : null,
      price_source: price?.list.name ?? null,
      blockers,
      invoiced: input.invoiced.lass.get(l.lass_id) ?? null,
    });
  }

  // ── Hours (kran, maskintransport), one line per assignment and day ──
  for (const h of input.hours) {
    const job = jobs.get(h.job_id);
    if (!job || job.status === 'avbruten' || basisOf(job) !== 'timme') continue;
    const price = resolvePrice(listsOf(job.customer_id, job.project_id), { uppdragstyp: job.uppdragstyp, material: job.material, units: ['timme'] });
    const blockers = [];
    if (h.timmar == null) blockers.push('timmar_saknas');
    if (!price) blockers.push('pris_saknas');
    groupFor(job.customer_id, job.project_id).rows.push({
      key: `timmar:${h.assignment_id}|${h.datum}`,
      kind: 'timmar',
      assignment_id: h.assignment_id,
      job_id: job.id,
      datum: h.datum,
      description: `${dm(h.datum)} ${TYPE_TEXT[job.uppdragstyp]} ${h.regnr ?? ''}`.trim(),
      detail: [h.driver_name, h.timmar != null && `${String(h.timmar).replace('.', ',')} h`].filter(Boolean).join(' · '),
      regnr: h.regnr ?? null,
      unit: 'timme',
      quantity: h.timmar,
      price_ore: price?.item.price_ore ?? null,
      amount_ore: price && h.timmar != null ? lineAmount('timme', price.item.price_ore, { hours: h.timmar }) : null,
      price_source: price?.list.name ?? null,
      blockers,
      invoiced: input.invoiced.hours.get(`${h.assignment_id}|${h.datum}`) ?? null,
    });
  }

  // ── Fixed-price jobs, invoiced once in the week they start ──
  for (const job of input.jobs) {
    if (job.status === 'avbruten' || job.datum_fran < from || job.datum_fran > to || basisOf(job) !== 'fast') continue;
    const price = resolvePrice(listsOf(job.customer_id, job.project_id), { uppdragstyp: job.uppdragstyp, material: job.material, units: ['fast'] });
    groupFor(job.customer_id, job.project_id).rows.push({
      key: `fast:${job.id}`,
      kind: 'fast',
      job_id: job.id,
      datum: job.datum_fran,
      description: `${TYPE_TEXT[job.uppdragstyp]}${job.material ? ` ${job.material}` : ''}`,
      detail: `Uppdrag ${job.id}, fast pris`,
      unit: 'fast',
      quantity: 1,
      price_ore: price.item.price_ore,
      amount_ore: price.item.price_ore,
      price_source: price.list.name,
      blockers: [],
      invoiced: input.invoiced.jobs.get(job.id) ?? null,
    });
  }

  const out = [...groups.values()].map((g) => {
    g.rows.sort((a, b) => a.datum.localeCompare(b.datum) || String(a.tid ?? '').localeCompare(String(b.tid ?? '')) || a.key.localeCompare(b.key));
    const open = g.rows.filter((r) => !r.invoiced);
    const blocked = open.filter((r) => r.blockers.length);
    const net = open.reduce((s, r) => s + (r.amount_ore ?? 0), 0);
    const counts = {};
    for (const r of blocked) for (const b of r.blockers) counts[b] = (counts[b] ?? 0) + 1;
    return {
      ...g,
      status: open.length === 0 ? 'fakturerad' : blocked.length ? 'blockerad' : open.length < g.rows.length ? 'delvis' : 'klar',
      blockers: Object.entries(counts).map(([code, count]) => ({ code, label: BLOCKERS[code], count })),
      totals: {
        rows: g.rows.length,
        open: open.length,
        blocked: blocked.length,
        invoiced: g.rows.length - open.length,
        net_ore: net,
        ...vatFor(g.vat_mode, net),
        invoiced_net_ore: g.rows.filter((r) => r.invoiced).reduce((s, r) => s + (r.amount_ore ?? 0), 0),
      },
    };
  }).sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'sv') || a.project.name.localeCompare(b.project.name, 'sv'));

  const sum = (f) => out.reduce((s, g) => s + f(g), 0);
  return {
    week, from, to,
    groups: out,
    totals: {
      groups: out.length,
      ready: out.filter((g) => g.status === 'klar' || g.status === 'delvis').length,
      blocked: out.filter((g) => g.status === 'blockerad').length,
      invoiced: out.filter((g) => g.status === 'fakturerad').length,
      open_net_ore: sum((g) => g.totals.net_ore),
      ready_net_ore: sum((g) => (g.status === 'klar' || g.status === 'delvis' ? g.totals.net_ore : 0)),
      invoiced_net_ore: sum((g) => g.totals.invoiced_net_ore),
    },
  };
}

/** The rows of a group that a batch would claim: the open ones. Throws if any of them is blocked. */
export function billableRows(group) {
  const open = group.rows.filter((r) => !r.invoiced);
  if (open.some((r) => r.blockers.length)) throw new Error('blocked');
  return open;
}
