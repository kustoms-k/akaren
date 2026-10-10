import { isoWeekRange } from '../lib/dates.js';
import { buildUnderlag } from '../lib/fakturaunderlag.js';

/**
 * Loads one ISO week of a company's billable work and builds the fakturaunderlag (lib/fakturaunderlag.js, pure):
 * lass, hours, jobs, customers, projects, price lists, and what invoice_lines have already claimed.
 * Used by the /faktura routes and by the demo seed to invoice its history weeks.
 */
export function createUnderlagLoader(db) {
  const stmt = {
    company: db.prepare('SELECT name, org_nr, address, postnr, ort, phone, email, bankgiro, default_vat_mode FROM companies WHERE id = ?'),
    lass: db.prepare(`
      SELECT lc.lass_id, lc.version, lc.customer_id, lc.project_id, lc.job_id, lc.datum, lc.tid, lc.vagsedel_nr,
             lc.vehicle_regnr, lc.material, lc.netto_kg, lc.till_namn, lc.review_status, d.name AS driver_name,
             lc.photo_id, w.facility_name AS weigh_list_facility, wr.line_no AS weigh_list_line
      FROM lass_current lc
      JOIN lass l ON l.id = lc.lass_id
      LEFT JOIN drivers d ON d.id = lc.driver_id
      LEFT JOIN weigh_list_rows wr ON wr.id = l.weigh_list_row_id
      LEFT JOIN weigh_lists w ON w.id = wr.weigh_list_id
      WHERE lc.company_id = ? AND lc.datum BETWEEN ? AND ?`),
    hours: db.prepare(`
      SELECT a.id AS assignment_id, a.job_id, a.datum, v.regnr, d.name AS driver_name,
             (SELECT t.timmar FROM time_entries t WHERE t.assignment_id = a.id AND t.datum = a.datum ORDER BY t.id DESC LIMIT 1) AS timmar
      FROM job_assignments a JOIN vehicles v ON v.id = a.vehicle_id JOIN drivers d ON d.id = a.driver_id
      WHERE a.company_id = ? AND a.datum BETWEEN ? AND ? AND a.cancelled_at IS NULL`),
    jobs: db.prepare(`
      SELECT id, customer_id, project_id, uppdragstyp, material, datum_fran, status FROM jobs
      WHERE company_id = @cid AND (datum_fran BETWEEN @from AND @to
        OR id IN (SELECT job_id FROM lass_current WHERE company_id = @cid AND datum BETWEEN @from AND @to)
        OR id IN (SELECT job_id FROM job_assignments WHERE company_id = @cid AND datum BETWEEN @from AND @to))`),
    customers: db.prepare('SELECT id, name, org_nr, address, postnr, ort, email, fortnox_customer_nr, vat_mode, price_list_id FROM customers WHERE company_id = ?'),
    projects: db.prepare('SELECT id, customer_id, name, customer_ref, price_list_id, address, postnr, ort FROM projects WHERE company_id = ?'),
    lists: db.prepare('SELECT id, name, is_default FROM price_lists WHERE company_id = ?'),
    items: db.prepare(`SELECT i.* FROM price_list_items i JOIN price_lists l ON l.id = i.price_list_id WHERE l.company_id = ?`),
    claimed: db.prepare(`
      SELECT il.lass_id, il.assignment_id, il.datum, il.job_id, b.id AS batch_id, b.kind, b.status, b.fortnox_document_nr, b.iso_week
      FROM invoice_lines il JOIN invoice_batches b ON b.id = il.batch_id WHERE b.company_id = ?`),
  };

  /** The whole week, priced and grouped. */
  return function load(companyId, week) {
    const { from, to } = isoWeekRange(week);
    const lists = stmt.lists.all(companyId).map((l) => ({ ...l, items: [] }));
    const byList = new Map(lists.map((l) => [l.id, l]));
    for (const it of stmt.items.all(companyId)) byList.get(it.price_list_id)?.items.push(it);
    const invoiced = { lass: new Map(), hours: new Map(), jobs: new Map() };
    for (const c of stmt.claimed.all(companyId)) {
      const b = { batch_id: c.batch_id, kind: c.kind, status: c.status, fortnox_document_nr: c.fortnox_document_nr, week: c.iso_week };
      if (c.lass_id) invoiced.lass.set(c.lass_id, b);
      else if (c.assignment_id) invoiced.hours.set(`${c.assignment_id}|${c.datum}`, b);
      else if (c.job_id) invoiced.jobs.set(c.job_id, b);
    }
    return buildUnderlag({
      week, from, to,
      companyVatMode: stmt.company.get(companyId).default_vat_mode,
      lass: stmt.lass.all(companyId, from, to),
      hours: stmt.hours.all(companyId, from, to),
      jobs: stmt.jobs.all({ cid: companyId, from, to }),
      customers: stmt.customers.all(companyId),
      projects: stmt.projects.all(companyId),
      priceLists: lists,
      invoiced,
    });
  };
}
