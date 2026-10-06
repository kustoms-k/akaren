import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, notFound, conflict, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { isValidDate, stockholmDate } from '../lib/dates.js';
import { optionalText, email } from '../lib/schemas.js';
import { buildOrderConfirmation, MAIL_ERRORS } from '../lib/orderConfirmation.js';

const STATUSES = ['bekraftad', 'pagar', 'klar', 'avbruten'];

const previewSchema = z.object({ message: optionalText(1000) }).strict();
const sendSchema = z.object({
  to: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.email({ error: 'Ange en giltig e-postadress.' }).max(320)),
  cc: email,
  message: optionalText(1000),
  office_copy: z.boolean().default(true),
}).strict();

export function jobsRouter({ db, audit, mail, limiters }) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT j.id, j.uppdragstyp, j.material, j.datum_fran, j.datum_till, j.tid, j.status, j.antal_lass,
           j.uppskattad_mangd, j.mangd_enhet, j.order_intake_id, j.created_at,
           c.id AS customer_id, c.name AS customer_name,
           p.id AS project_id, p.name AS project_name, p.miljozon,
           (SELECT COUNT(*) FROM lass l WHERE l.job_id = j.id) AS lass_count,
           (SELECT COUNT(*) FROM job_assignments a WHERE a.job_id = j.id AND a.cancelled_at IS NULL) AS assignment_count,
           -- Progress and today's state, so the list answers "is it running, is it covered, how far has it got".
           (SELECT COALESCE(SUM(lc.netto_kg), 0) FROM lass_current lc WHERE lc.job_id = j.id) AS netto_kg,
           (SELECT COUNT(*) FROM lass_current lc WHERE lc.job_id = j.id AND lc.review_status = 'behover_granskas') AS to_review,
           (SELECT COUNT(*) FROM lass_current lc WHERE lc.job_id = j.id AND lc.datum = @today) AS lass_today,
           (SELECT MAX(lc.datum) FROM lass_current lc WHERE lc.job_id = j.id) AS last_lass_datum,
           (SELECT group_concat(v.regnr, ', ') FROM job_assignments a JOIN vehicles v ON v.id = a.vehicle_id
              WHERE a.job_id = j.id AND a.datum = @today AND a.cancelled_at IS NULL) AS today_regnrs,
           (SELECT MIN(a.datum) FROM job_assignments a WHERE a.job_id = j.id AND a.datum > @today AND a.cancelled_at IS NULL) AS next_assignment,
           (j.datum_fran <= @today AND COALESCE(j.datum_till, j.datum_fran) >= @today) AS runs_today
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
  const stmtSourceEmail = db.prepare(`
    SELECT thread_id, subject, from_name, from_email, received_at FROM inbound_emails
    WHERE job_id = ? AND company_id = ? AND category != 'ovrigt' ORDER BY received_at LIMIT 1
  `);
  const stmtSetStatus = db.prepare(`
    UPDATE jobs SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND company_id = ?
  `);
  const stmtCompany = db.prepare(`
    SELECT name, org_nr, address, postnr, ort, phone, email, order_terms FROM companies WHERE id = ?
  `);
  const stmtConfirmations = db.prepare(`
    SELECT oc.id, oc.to_email, oc.cc_email, oc.bcc_email, oc.subject, oc.status, oc.error, oc.created_at,
           u.name AS sent_by_name
    FROM order_confirmations oc
    LEFT JOIN users u ON u.id = oc.sent_by_user_id
    WHERE oc.company_id = ? AND oc.job_id = ?
    ORDER BY oc.id DESC
  `);
  const stmtConfirmation = db.prepare(`
    SELECT id, to_email, cc_email, bcc_email, subject, body_text, body_html, status, error, created_at
    FROM order_confirmations WHERE id = ? AND job_id = ? AND company_id = ?
  `);
  // Last address that received a confirmation for the same project: the default for orders without an email (SMS).
  const stmtProjectRecipient = db.prepare(`
    SELECT oc.to_email FROM order_confirmations oc JOIN jobs j ON j.id = oc.job_id
    WHERE oc.company_id = ? AND j.project_id = ? AND oc.status != 'misslyckat'
    ORDER BY oc.id DESC LIMIT 1
  `);
  const stmtInsertConfirmation = db.prepare(`
    INSERT INTO order_confirmations (company_id, job_id, to_email, cc_email, bcc_email, subject, body_text, body_html,
      status, error, message_id, sent_by_user_id)
    VALUES (@company_id, @job_id, @to_email, @cc_email, @bcc_email, @subject, @body_text, @body_html,
      @status, @error, @message_id, @sent_by_user_id)
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
      today: stockholmDate(),
    }).map((j) => ({ ...j, runs_today: Boolean(j.runs_today) })));
  });

  router.get('/:id', (req, res) => {
    const job = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!job) throw notFound('Uppdraget finns inte.');
    const { overrides_json, ...rest } = job;
    let overrides = null;
    try { overrides = overrides_json ? JSON.parse(overrides_json) : null; } catch { /* ignore */ }
    res.json({
      ...rest, overrides, lass_count: stmtLassCount.pluck().get(job.id),
      source_email: stmtSourceEmail.get(job.id, req.companyId) ?? null,
    });
  });

  // ── Order confirmation email ──

  const confirmationView = (row) => ({
    ...row,
    error_message: row.error ? MAIL_ERRORS[row.error] ?? MAIL_ERRORS.other : null,
  });

  function loadJob(req) {
    const job = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!job) throw notFound('Uppdraget finns inte.');
    return job;
  }

  router.get('/:id/order-confirmation', (req, res) => {
    const job = loadJob(req);
    const company = stmtCompany.get(req.companyId);
    res.json({
      default_to: job.epost ?? stmtProjectRecipient.pluck().get(req.companyId, job.project_id) ?? null,
      office_email: company.email ?? null,
      mail_enabled: mail.enabled,
      can_send: job.status !== 'avbruten',
      history: stmtConfirmations.all(req.companyId, job.id).map(confirmationView),
    });
  });

  router.post('/:id/order-confirmation/preview', (req, res) => {
    const job = loadJob(req);
    const { message } = validate(previewSchema, req.body ?? {});
    res.json(buildOrderConfirmation({ job, company: stmtCompany.get(req.companyId), message }));
  });

  router.get('/:id/order-confirmation/:cid', (req, res) => {
    const job = loadJob(req);
    const row = stmtConfirmation.get(idParam(req.params.cid), job.id, req.companyId);
    if (!row) throw notFound('Orderbekräftelsen finns inte.');
    res.json(confirmationView(row));
  });

  router.post('/:id/order-confirmation', limiters.mail, asyncHandler(async (req, res) => {
    const job = loadJob(req);
    if (job.status === 'avbruten') throw conflict('cancelled', 'Uppdraget är avbrutet. Ingen orderbekräftelse skickas.');
    const input = validate(sendSchema, req.body);
    const company = stmtCompany.get(req.companyId);
    const { subject, text, html } = buildOrderConfirmation({ job, company, message: input.message });

    const lower = (v) => v?.toLowerCase() ?? null;
    const cc = input.cc && lower(input.cc) !== lower(input.to) ? input.cc : null;
    const bcc = input.office_copy && company.email && ![lower(input.to), lower(cc)].includes(lower(company.email))
      ? company.email : null;

    const result = await mail.send({
      fromName: company.name, to: input.to, cc, bcc, replyTo: company.email ?? null, subject, text, html,
    });
    const id = Number(stmtInsertConfirmation.run({
      company_id: req.companyId, job_id: job.id, to_email: input.to, cc_email: cc, bcc_email: bcc,
      subject, body_text: text, body_html: html, status: result.status, error: result.error ?? null,
      message_id: result.messageId ?? null, sent_by_user_id: req.user.id,
    }).lastInsertRowid);
    audit({
      ...officeActor(req), entity: 'job', entityId: job.id, action: 'order_confirmation',
      after: { confirmation_id: id, to: input.to, cc, bcc, status: result.status, error: result.error ?? null },
    });
    res.status(201).json(confirmationView({
      id, to_email: input.to, cc_email: cc, bcc_email: bcc, subject, status: result.status,
      error: result.error ?? null, created_at: new Date().toISOString(), sent_by_name: req.user.name ?? null,
    }));
  }));

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
