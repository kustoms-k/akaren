import { Router } from 'express';
import { z } from 'zod';
import { validate, idParam, notFound, conflict, badRequest } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { optionalText, requiredText, date, idRef } from '../lib/schemas.js';
import { isValidDate, stockholmDate } from '../lib/dates.js';
import { hazardDeadline } from '../lib/workdays.js';
import { LASS_FIELDS, submittedConfidence } from '../lib/lassReview.js';
import { lassFieldsSchema } from './driver.js';

const REVIEW_STATUSES = ['behover_granskas', 'ok', 'granskad'];

const manualSchema = z.object({
  job_id: idRef,
  assignment_id: idRef.nullable().optional(),
  fields: lassFieldsSchema,
  note: optionalText(500),
}).strict();

const correctionSchema = z.object({
  fields: lassFieldsSchema.partial(),
  change_reason: requiredText(200),
  note: optionalText(500),
}).strict();

const reviewSchema = z.object({
  fields: lassFieldsSchema.partial().optional(),
  change_reason: optionalText(200),
  note: optionalText(500),
}).strict();

const hazardReportSchema = z.object({
  reported_on: date.optional(),
  reference: optionalText(100),
}).strict();

const parseJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
/** Only the fields the client sent; an absent field must never overwrite a stored value. */
const sentFields = (fields) => Object.fromEntries(Object.entries(fields ?? {}).filter(([, v]) => v !== undefined));
const sameValue = (a, b) => String(a ?? '') === String(b ?? '');
const futureDate = () => badRequest('Datumet kan inte vara i framtiden.', { fields: { 'fields.datum': 'Datumet kan inte vara i framtiden.' } });

/** Office: review queue, corrections, manual entry and hazardous-waste reporting (/api/lass). */
export function lassRouter({ db, audit, lass }) {
  const router = Router();

  const LIST_SELECT = `
    SELECT lc.lass_id AS id, lc.version, lc.datum, lc.tid, lc.vagsedel_nr, lc.netto_kg, lc.material, lc.till_namn,
           lc.avfallskod, lc.farligt_avfall, lc.vehicle_regnr, lc.photo_id, lc.review_status, lc.review_reasons_json,
           lc.created_by_kind, lc.corrected_at, lc.job_id, lc.customer_id, lc.project_id,
           c.name AS customer_name, p.name AS project_name, d.name AS driver_name
    FROM lass_current lc
    JOIN customers c ON c.id = lc.customer_id
    JOIN projects p ON p.id = lc.project_id
    LEFT JOIN drivers d ON d.id = lc.driver_id
    WHERE lc.company_id = @cid
      AND (@job IS NULL OR lc.job_id = @job)
      AND (@project IS NULL OR lc.project_id = @project)
      AND (@customer IS NULL OR lc.customer_id = @customer)
      AND (@from IS NULL OR lc.datum >= @from)
      AND (@to IS NULL OR lc.datum <= @to)
      AND (@review IS NULL OR lc.review_status = @review)
      AND (@farligt = 0 OR lc.farligt_avfall = 1)
      AND (@q IS NULL OR lc.vagsedel_nr LIKE @like OR lc.vehicle_regnr LIKE @like)`;
  // The review queue is worked oldest first; everything else is newest first.
  const stmtListNewest = db.prepare(`${LIST_SELECT} ORDER BY lc.datum DESC, lc.tid DESC, lc.lass_id DESC LIMIT 500`);
  const stmtListOldest = db.prepare(`${LIST_SELECT} ORDER BY lc.datum, lc.tid, lc.lass_id LIMIT 500`);

  const stmtNextToReview = db.prepare(`
    SELECT lass_id FROM lass_current
    WHERE company_id = ? AND review_status = 'behover_granskas' AND lass_id != ?
    ORDER BY datum, tid, lass_id LIMIT 1
  `);
  const stmtCountToReview = db.prepare(`SELECT COUNT(*) FROM lass_current WHERE company_id = ? AND review_status = 'behover_granskas'`);
  const stmtVersions = db.prepare(`
    SELECT v.*, u.name AS user_name, d.name AS driver_name
    FROM lass_versions v
    LEFT JOIN users u ON u.id = v.created_by_user_id
    LEFT JOIN drivers d ON d.id = v.created_by_driver_id
    WHERE v.lass_id = ? ORDER BY v.version
  `);
  const stmtContext = db.prepare(`
    SELECT j.id AS job_id, j.uppdragstyp, j.material AS job_material, j.status AS job_status,
           c.name AS customer_name, p.name AS project_name, p.customer_ref,
           v.regnr AS assigned_regnr, a.datum AS assignment_datum, dr.name AS driver_name
    FROM lass l
    JOIN jobs j ON j.id = l.job_id
    JOIN customers c ON c.id = j.customer_id
    JOIN projects p ON p.id = j.project_id
    LEFT JOIN job_assignments a ON a.id = l.assignment_id
    LEFT JOIN vehicles v ON v.id = a.vehicle_id
    LEFT JOIN drivers dr ON dr.id = a.driver_id
    WHERE l.id = ? AND l.company_id = ?
  `);
  const stmtExtraction = db.prepare('SELECT fields_json FROM ai_extractions WHERE id = ? AND company_id = ?');
  const stmtInvoiced = db.prepare('SELECT 1 FROM invoice_lines WHERE lass_id = ? LIMIT 1');
  const stmtJob = db.prepare('SELECT id, customer_id, project_id, status FROM jobs WHERE id = ? AND company_id = ?');
  const stmtAssignment = db.prepare(`
    SELECT a.id, a.driver_id, v.regnr FROM job_assignments a JOIN vehicles v ON v.id = a.vehicle_id
    WHERE a.id = ? AND a.job_id = ? AND a.company_id = ? AND a.cancelled_at IS NULL
  `);

  const stmtHazardList = db.prepare(`
    SELECT lc.lass_id AS id, lc.datum, lc.tid, lc.vagsedel_nr, lc.netto_kg, lc.material, lc.avfallskod, lc.till_namn,
           lc.vehicle_regnr, lc.review_status, c.name AS customer_name, p.name AS project_name,
           h.reported_on, h.reference
    FROM lass_current lc
    JOIN customers c ON c.id = lc.customer_id
    JOIN projects p ON p.id = lc.project_id
    LEFT JOIN hazard_reports h ON h.lass_id = lc.lass_id AND h.withdrawn_at IS NULL
    WHERE lc.company_id = ? AND lc.farligt_avfall = 1 AND (? = 1 OR h.id IS NULL)
    ORDER BY lc.datum, lc.tid, lc.lass_id
    LIMIT 500
  `);
  const stmtHazardReport = db.prepare(`
    SELECT h.id, h.reported_on, h.reference, h.created_at, u.name AS reported_by_name
    FROM hazard_reports h LEFT JOIN users u ON u.id = h.reported_by_user_id
    WHERE h.lass_id = ? AND h.company_id = ? AND h.withdrawn_at IS NULL
  `);
  const stmtInsertHazard = db.prepare(`
    INSERT INTO hazard_reports (company_id, lass_id, reported_on, reference, reported_by_user_id) VALUES (?, ?, ?, ?, ?)
  `);
  const stmtWithdrawHazard = db.prepare(`
    UPDATE hazard_reports SET withdrawn_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), withdrawn_by_user_id = ?
    WHERE lass_id = ? AND company_id = ? AND withdrawn_at IS NULL
  `);

  const listRow = ({ review_reasons_json, ...l }) => ({
    ...l, farligt_avfall: Boolean(l.farligt_avfall), review_reasons: parseJson(review_reasons_json, []),
  });

  function load(req) {
    const current = lass.current(idParam(req.params.id), req.companyId);
    if (!current) throw notFound('Lasset finns inte.');
    return current;
  }

  function hazardView(current, companyId, today = stockholmDate()) {
    if (!current.farligt_avfall) return null;
    const report = stmtHazardReport.get(current.lass_id, companyId) ?? null;
    return { ...hazardDeadline(current.datum, today, report?.reported_on), report };
  }

  /** The lass fields in `patch` whose value differs from `current`. */
  const changedKeys = (patch, current) => Object.keys(patch ?? {})
    .filter((k) => LASS_FIELDS.includes(k) && !sameValue(k === 'farligt_avfall' ? Boolean(patch[k]) : patch[k], current[k]));

  // ── Lists ──

  router.get('/', (req, res) => {
    const q = req.query;
    const num = (v) => (v ? Number(v) || -1 : null);
    const review = REVIEW_STATUSES.includes(q.review) ? q.review : null;
    const search = typeof q.q === 'string' && q.q.trim() ? q.q.trim() : null;
    const params = {
      cid: req.companyId, job: num(q.job_id), project: num(q.project_id), customer: num(q.customer_id),
      from: isValidDate(q.from) ? q.from : null, to: isValidDate(q.to) ? q.to : null,
      review, farligt: q.farligt === '1' ? 1 : 0, q: search, like: search && `%${search}%`,
    };
    const stmt = review === 'behover_granskas' ? stmtListOldest : stmtListNewest;
    res.json(stmt.all(params).map(listRow));
  });

  router.get('/summary', (req, res) => {
    const today = stockholmDate();
    const hazards = stmtHazardList.all(req.companyId, 0).map((h) => hazardDeadline(h.datum, today).state);
    res.json({
      to_review: stmtCountToReview.pluck().get(req.companyId),
      hazard_unreported: hazards.length,
      hazard_overdue: hazards.filter((s) => s === 'forsenad').length,
    });
  });

  router.get('/farligt-avfall', (req, res) => {
    const today = stockholmDate();
    const rows = stmtHazardList.all(req.companyId, req.query.all === '1' ? 1 : 0).map((h) => ({
      ...h, ...hazardDeadline(h.datum, today, h.reported_on),
    }));
    rows.sort((a, b) => (a.state === 'rapporterad') - (b.state === 'rapporterad') || a.deadline.localeCompare(b.deadline));
    res.json(rows);
  });

  // ── One lass ──

  router.get('/:id', (req, res) => {
    const current = load(req);
    const extraction = current.ai_extraction_id ? parseJson(stmtExtraction.get(current.ai_extraction_id, req.companyId)?.fields_json, null) : null;
    res.json({
      lass: current,
      context: stmtContext.get(current.lass_id, req.companyId),
      versions: stmtVersions.all(current.lass_id).map((v) => ({
        ...v,
        farligt_avfall: Boolean(v.farligt_avfall),
        field_confidence: parseJson(v.field_confidence_json, {}),
        review_reasons: parseJson(v.review_reasons_json, []),
      })),
      ai: extraction ? { fields: extraction.fields, warnings: extraction.warnings ?? [] } : null,
      invoiced: Boolean(stmtInvoiced.get(current.lass_id)),
      hazard: hazardView(current, req.companyId),
      next_review_id: stmtNextToReview.pluck().get(req.companyId, current.lass_id) ?? null,
    });
  });

  // Office enters a lass by hand (e.g. from a paper vågsedel). Without a photo it goes to review.
  router.post('/', (req, res) => {
    const input = validate(manualSchema, req.body);
    const job = stmtJob.get(input.job_id, req.companyId);
    if (!job) throw badRequest('Uppdraget finns inte.', { fields: { job_id: 'Uppdraget finns inte.' } });
    if (job.status === 'avbruten') throw conflict('job_cancelled', 'Uppdraget är avbrutet.');
    if (input.fields.datum > stockholmDate()) throw futureDate();
    let assignment = null;
    if (input.assignment_id) {
      assignment = stmtAssignment.get(input.assignment_id, job.id, req.companyId);
      if (!assignment) throw badRequest('Tilldelningen finns inte på uppdraget.', { fields: { assignment_id: 'Välj en tilldelning på uppdraget.' } });
    }
    const values = Object.fromEntries(LASS_FIELDS.map((k) => [k, input.fields[k] ?? null]));
    values.farligt_avfall = Boolean(input.fields.farligt_avfall);
    const { lass: created } = lass.create({
      companyId: req.companyId, jobId: job.id, assignmentId: assignment?.id ?? null,
      customerId: job.customer_id, projectId: job.project_id,
      vehicleRegnr: assignment?.regnr ?? null, driverId: assignment?.driver_id ?? null,
      values, confidence: submittedConfidence(values, null, 'kontor'), note: input.note ?? null,
      createdByKind: 'office', createdByUserId: req.user.id,
    });
    audit({ ...officeActor(req), entity: 'lass', entityId: created.lass_id, action: 'create_manual', after: { job_id: job.id, review: created.review_status } });
    res.status(201).json(created);
  });

  // Correction without approving. An already reviewed lass stays reviewed: the office made the change.
  router.post('/:id/versions', (req, res) => {
    const current = load(req);
    const input = validate(correctionSchema, req.body);
    const patch = sentFields(input.fields);
    if (patch.datum && patch.datum > stockholmDate()) throw futureDate();
    const changed = changedKeys(patch, current);
    if (!changed.length && (input.note === undefined || sameValue(input.note, current.note))) {
      throw badRequest('Inget har ändrats.');
    }
    const updated = lass.addVersion({
      lassId: current.lass_id, companyId: req.companyId, patch, note: input.note,
      changeReason: input.change_reason, personKind: 'kontor',
      reviewStatus: current.review_status === 'granskad' ? 'granskad' : null,
      createdByKind: 'office', createdByUserId: req.user.id,
    });
    audit({
      ...officeActor(req), entity: 'lass', entityId: current.lass_id, action: 'correct',
      before: Object.fromEntries(changed.map((k) => [k, current[k]])),
      after: { version: updated.version, ...Object.fromEntries(changed.map((k) => [k, updated[k]])), reason: input.change_reason },
    });
    res.status(201).json(updated);
  });

  // Approve, optionally with corrections. Writes a new version with review_status 'granskad'.
  router.post('/:id/review', (req, res) => {
    const current = load(req);
    if (current.review_status === 'granskad') throw conflict('already_reviewed', 'Lasset är redan granskat.');
    const input = validate(reviewSchema, req.body);
    const patch = sentFields(input.fields);
    if (patch.datum && patch.datum > stockholmDate()) throw futureDate();
    const changed = changedKeys(patch, current);
    if (changed.length && !input.change_reason) {
      throw badRequest('Ange varför värdena ändras.', { fields: { change_reason: 'Ange varför värdena ändras.' } });
    }
    const updated = lass.addVersion({
      lassId: current.lass_id, companyId: req.companyId, patch, note: input.note,
      changeReason: input.change_reason ?? 'Granskad av kontoret', personKind: 'kontor',
      reviewStatus: 'granskad', markChecked: true,
      createdByKind: 'office', createdByUserId: req.user.id,
    });
    audit({
      ...officeActor(req), entity: 'lass', entityId: current.lass_id, action: 'review',
      before: { review_status: current.review_status, reasons: current.review_reasons, ...Object.fromEntries(changed.map((k) => [k, current[k]])) },
      after: { version: updated.version, ...Object.fromEntries(changed.map((k) => [k, updated[k]])) },
    });
    res.status(201).json({ lass: updated, next_review_id: stmtNextToReview.pluck().get(req.companyId, current.lass_id) ?? null });
  });

  // ── Hazardous waste: record the report to Naturvårdsverket's avfallsregister ──

  router.post('/:id/hazard-report', (req, res) => {
    const current = load(req);
    if (!current.farligt_avfall) throw conflict('not_hazardous', 'Lasset är inte markerat som farligt avfall.');
    const input = validate(hazardReportSchema, req.body ?? {});
    const reportedOn = input.reported_on ?? stockholmDate();
    if (reportedOn > stockholmDate()) throw badRequest('Datumet kan inte vara i framtiden.', { fields: { reported_on: 'Datumet kan inte vara i framtiden.' } });
    if (reportedOn < current.datum) throw badRequest('Rapporten kan inte vara före transporten.', { fields: { reported_on: 'Rapporten kan inte vara före transporten.' } });
    if (stmtHazardReport.get(current.lass_id, req.companyId)) throw conflict('already_reported', 'Lasset är redan markerat som rapporterat.');
    stmtInsertHazard.run(req.companyId, current.lass_id, reportedOn, input.reference ?? null, req.user.id);
    audit({ ...officeActor(req), entity: 'lass', entityId: current.lass_id, action: 'hazard_report', after: { reported_on: reportedOn, reference: input.reference ?? null } });
    res.status(201).json(hazardView(current, req.companyId));
  });

  router.delete('/:id/hazard-report', (req, res) => {
    const current = load(req);
    const before = stmtHazardReport.get(current.lass_id, req.companyId);
    if (!before) throw notFound('Lasset är inte markerat som rapporterat.');
    stmtWithdrawHazard.run(req.user.id, current.lass_id, req.companyId);
    audit({ ...officeActor(req), entity: 'lass', entityId: current.lass_id, action: 'hazard_report_withdraw', before });
    res.json(hazardView(current, req.companyId));
  });

  return router;
}
