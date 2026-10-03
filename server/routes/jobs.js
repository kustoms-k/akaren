import { Router } from 'express';
import { z } from 'zod';
import { idParam, notFound, conflict, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { isValidDate } from '../lib/dates.js';

const STATUSES = ['bekraftad', 'pagar', 'klar', 'avbruten'];

export function jobsRouter({ db, audit }) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT j.id, j.uppdragstyp, j.material, j.datum_fran, j.datum_till, j.tid, j.status, j.antal_lass,
           j.uppskattad_mangd, j.mangd_enhet, j.order_intake_id, j.created_at,
           c.id AS customer_id, c.name AS customer_name,
           p.id AS project_id, p.name AS project_name, p.miljozon,
           (SELECT COUNT(*) FROM lass l WHERE l.job_id = j.id) AS lass_count,
           (SELECT COUNT(*) FROM job_assignments a WHERE a.job_id = j.id AND a.cancelled_at IS NULL) AS assignment_count
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    JOIN projects p ON p.id = j.project_id
    WHERE j.company_id = @cid
      AND (@status IS NULL OR j.status = @status)
      AND (@from IS NULL OR COALESCE(j.datum_till, j.datum_fran) >= @from)
      AND (@to IS NULL OR j.datum_fran <= @to)
    ORDER BY j.datum_fran DESC, j.id DESC
    LIMIT 200
  `);
  const stmtGet = db.prepare(`
    SELECT j.*, c.name AS customer_name, c.org_nr AS customer_org_nr,
           p.name AS project_name, p.address AS project_address, p.postnr AS project_postnr, p.ort AS project_ort,
           p.customer_ref, p.miljozon,
           i.raw_text AS order_text, i.overrides_json, u.name AS created_by_name
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    JOIN projects p ON p.id = j.project_id
    LEFT JOIN order_intakes i ON i.id = j.order_intake_id
    LEFT JOIN users u ON u.id = j.created_by_user_id
    WHERE j.id = ? AND j.company_id = ?
  `);
  const stmtLassCount = db.prepare('SELECT COUNT(*) FROM lass WHERE job_id = ?');
  const stmtSetStatus = db.prepare(`
    UPDATE jobs SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND company_id = ?
  `);
  const stmtCancel = db.prepare(`
    UPDATE jobs SET status = 'avbruten', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND company_id = ? AND status IN ('bekraftad', 'pagar')
  `);

  router.get('/', (req, res) => {
    const q = req.query;
    res.json(stmtList.all({
      cid: req.companyId,
      status: STATUSES.includes(q.status) ? q.status : null,
      from: isValidDate(q.from) ? q.from : null,
      to: isValidDate(q.to) ? q.to : null,
    }));
  });

  router.get('/:id', (req, res) => {
    const job = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!job) throw notFound('Uppdraget finns inte.');
    const { overrides_json, ...rest } = job;
    let overrides = null;
    try { overrides = overrides_json ? JSON.parse(overrides_json) : null; } catch { /* ignore */ }
    res.json({ ...rest, overrides, lass_count: stmtLassCount.pluck().get(job.id) });
  });

  // Office marks a job done (or reopens it).
  router.post('/:id/status', (req, res) => {
    const id = idParam(req.params.id);
    const job = stmtGet.get(id, req.companyId);
    if (!job) throw notFound('Uppdraget finns inte.');
    const { status } = validate(z.object({ status: z.enum(['pagar', 'klar'], { error: 'Ogiltig status.' }) }).strict(), req.body);
    if (job.status === 'avbruten') throw conflict('cancelled', 'Uppdraget är avbrutet.');
    stmtSetStatus.run(status, id, req.companyId);
    audit({ ...officeActor(req), entity: 'job', entityId: id, action: 'status', before: { status: job.status }, after: { status } });
    res.json({ ok: true, status });
  });

  router.post('/:id/cancel', (req, res) => {
    const id = idParam(req.params.id);
    if (!stmtGet.get(id, req.companyId)) throw notFound('Uppdraget finns inte.');
    if (stmtLassCount.pluck().get(id) > 0) {
      throw conflict('has_lass', 'Uppdraget har rapporterade lass och kan inte avbrytas. Markera det som klart i stället.');
    }
    if (stmtCancel.run(id, req.companyId).changes === 0) throw conflict('not_cancellable', 'Uppdraget kan inte avbrytas.');
    audit({ ...officeActor(req), entity: 'job', entityId: id, action: 'cancel' });
    res.json({ ok: true });
  });

  return router;
}
