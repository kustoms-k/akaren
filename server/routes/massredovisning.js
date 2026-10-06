import { Router } from 'express';
import { badRequest, notFound } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { isValidDate, stockholmDate } from '../lib/dates.js';
import { summarize, toCsv, fileSlug } from '../lib/massredovisning.js';

/**
 * Massredovisning (/api/massredovisning?project_id&from&to[&format=csv]): every lass of a project
 * in a date range, with destination, waste code and weight. The PDF is rendered in the client.
 */
export function massredovisningRouter({ db, audit }) {
  const router = Router();

  const stmtProject = db.prepare(`
    SELECT p.id, p.name, p.customer_ref, p.address, p.postnr, p.ort,
           c.id AS customer_id, c.name AS customer_name, c.org_nr AS customer_org_nr
    FROM projects p JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ? AND p.company_id = ?
  `);
  const stmtCompany = db.prepare('SELECT name, org_nr, address, postnr, ort FROM companies WHERE id = ?');
  const stmtRows = db.prepare(`
    SELECT lc.lass_id, lc.version, lc.datum, lc.tid, lc.vagsedel_nr, lc.vehicle_regnr, lc.material, lc.avfallskod,
           lc.farligt_avfall, lc.netto_kg, lc.fran_text, lc.till_namn, lc.till_orgnr, lc.till_adress,
           lc.review_status, lc.photo_id IS NOT NULL AS has_photo, h.reported_on AS hazard_reported_on
    FROM lass_current lc
    LEFT JOIN hazard_reports h ON h.lass_id = lc.lass_id AND h.withdrawn_at IS NULL
    WHERE lc.company_id = @cid AND lc.project_id = @project
      AND (@from IS NULL OR lc.datum >= @from)
      AND (@to IS NULL OR lc.datum <= @to)
    ORDER BY lc.datum, lc.tid, lc.lass_id
  `);

  router.get('/', (req, res) => {
    const { project_id: projectId, from, to, format } = req.query;
    if (!projectId) throw badRequest('Välj ett projekt.', { fields: { project_id: 'Välj ett projekt.' } });
    if ((from && !isValidDate(from)) || (to && !isValidDate(to))) throw badRequest('Ogiltigt datum (ÅÅÅÅ-MM-DD).');
    if (from && to && from > to) throw badRequest('Från-datum ligger efter till-datum.');
    const project = stmtProject.get(Number(projectId) || -1, req.companyId);
    if (!project) throw notFound('Projektet finns inte.');

    const rows = stmtRows.all({ cid: req.companyId, project: project.id, from: from || null, to: to || null })
      .map((r) => ({ ...r, farligt_avfall: Boolean(r.farligt_avfall), has_photo: Boolean(r.has_photo) }));

    if (format === 'csv') {
      const name = `massredovisning-${fileSlug(project.name)}-${from || 'start'}-${to || stockholmDate()}.csv`;
      audit({ ...officeActor(req), entity: 'project', entityId: project.id, action: 'export_massredovisning', after: { from: from || null, to: to || null, rows: rows.length } });
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${name}"`);
      return res.send(toCsv(rows));
    }

    res.json({
      project,
      company: stmtCompany.get(req.companyId),
      from: from || null,
      to: to || null,
      generated_at: new Date().toISOString(),
      rows,
      ...summarize(rows),
    });
  });

  return router;
}
