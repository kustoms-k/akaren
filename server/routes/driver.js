import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HttpError, asyncHandler, validate, idParam, notFound, conflict, badRequest } from '../lib/http.js';
import { optionalText, orgNr, date, idRef } from '../lib/schemas.js';
import { addDays, stockholmDate } from '../lib/dates.js';
import { normalizeRegnr } from '../lib/normalize.js';
import { LASS_FIELDS, submittedConfidence } from '../lib/lassReview.js';
import { AiNotConfiguredError, AiBudgetExceededError, AiExtractionError } from '../services/ai.js';

const MAX_UPLOAD = 15 * 1024 * 1024;
const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const lassFieldsSchema = z.object({
  vagsedel_nr: optionalText(40),
  datum: date,
  tid: z.preprocess(blankToNull, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ange tid som TT:MM.').nullable().optional()),
  material: optionalText(120),
  netto_kg: z.preprocess(blankToNull, z.coerce.number().int('Ange vikten i hela kilo.')
    .min(1, 'Vikten måste vara större än 0.').max(60_000, 'Orimligt hög vikt.').nullable().optional()),
  avfallskod: z.preprocess((v) => (typeof v === 'string' ? (v.replace(/[\s*]/g, '') || null) : v),
    z.string().regex(/^\d{6}$/, 'Avfallskoden ska vara sex siffror.').nullable().optional()),
  farligt_avfall: z.boolean().optional(),
  fran_text: optionalText(200),
  till_namn: optionalText(200),
  till_orgnr: orgNr,
  till_adress: optionalText(200),
}).strict();

const lassCreateSchema = z.object({
  assignment_id: idRef,
  client_uuid: z.uuid('Ogiltigt id.'),
  photo_id: z.string().regex(/^[0-9a-f]{32}$/).nullable().optional(),
  ai_extraction_id: idRef.nullable().optional(),
  fields: lassFieldsSchema,
  note: optionalText(500),
}).strict();

const lassPatchSchema = z.object({
  fields: lassFieldsSchema.partial(),
  change_reason: optionalText(200),
  note: optionalText(500),
}).strict();

const AI_MESSAGES = {
  ai_not_configured: 'Automatisk avläsning är inte påslagen. Fyll i värdena själv.',
  ai_budget_exceeded: 'Automatisk avläsning är pausad. Fyll i värdena själv.',
  ai_extraction_failed: 'Vågsedeln kunde inte läsas automatiskt. Fyll i värdena själv.',
};

/** Driver API (/api/driver). Everything is scoped to the driver behind the magic link. */
export function driverRouter({ db, auth, dispatch, photos, ai, lass, audit, limiters, logger = console }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD, files: 1, fields: 10 },
    fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
  });

  const stmtMe = db.prepare('SELECT d.name, c.name AS company_name FROM drivers d JOIN companies c ON c.id = d.company_id WHERE d.id = ?');
  const stmtLinkExpiry = db.prepare('SELECT expires_at FROM driver_links WHERE id = ?');
  const ASSIGNMENT_SELECT = `
    SELECT a.id, a.datum, a.job_id, v.regnr, v.typ AS vehicle_typ,
           j.uppdragstyp, j.material, j.tid, j.fran_text, j.till_text, j.instruktioner, j.kontaktperson, j.telefon,
           j.antal_lass, j.status AS job_status,
           c.name AS customer_name, p.name AS project_name, p.address AS project_address, p.postnr AS project_postnr,
           p.ort AS project_ort, p.miljozon,
           (SELECT COUNT(*) FROM lass l WHERE l.assignment_id = a.id) AS lass_count,
           (SELECT t.timmar FROM time_entries t WHERE t.assignment_id = a.id ORDER BY t.id DESC LIMIT 1) AS timmar
    FROM job_assignments a
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN jobs j ON j.id = a.job_id
    JOIN projects p ON p.id = j.project_id
    JOIN customers c ON c.id = j.customer_id`;
  const stmtAssignments = db.prepare(`${ASSIGNMENT_SELECT}
    WHERE a.driver_id = ? AND a.company_id = ? AND a.cancelled_at IS NULL AND j.status IN ('bekraftad', 'pagar')
      AND a.datum BETWEEN ? AND ?
    ORDER BY a.datum, j.tid, a.id`);
  const stmtAssignment = db.prepare(`${ASSIGNMENT_SELECT}
    WHERE a.id = ? AND a.driver_id = ? AND a.company_id = ? AND a.cancelled_at IS NULL`);
  const stmtJobRefs = db.prepare('SELECT customer_id, project_id FROM jobs WHERE id = ?');
  const stmtAssignmentLass = db.prepare(`
    SELECT lass_id AS id, version, datum, tid, vagsedel_nr, netto_kg, material, till_namn, avfallskod, farligt_avfall,
           photo_id, review_status, created_at
    FROM lass_current WHERE assignment_id = ? ORDER BY reported_at DESC
  `);
  const stmtExtraction = db.prepare(`
    SELECT id, fields_json FROM ai_extractions
    WHERE id = ? AND company_id = ? AND input_photo_id = ? AND kind = 'vagsedel' AND error IS NULL
  `);
  const stmtLatestExtraction = db.prepare(`
    SELECT id, fields_json FROM ai_extractions
    WHERE company_id = ? AND input_photo_id = ? AND kind = 'vagsedel' AND error IS NULL ORDER BY id DESC LIMIT 1
  `);
  const stmtLassOwner = db.prepare(`
    SELECT l.id, a.driver_id FROM lass l JOIN job_assignments a ON a.id = l.assignment_id
    WHERE l.id = ? AND l.company_id = ?
  `);
  const stmtInsertHours = db.prepare(`
    INSERT INTO time_entries (company_id, assignment_id, datum, timmar, created_by_kind, created_by_driver_id)
    VALUES (?, ?, ?, ?, 'driver', ?)
  `);

  const driverActor = (req) => ({ companyId: req.companyId, actorKind: 'driver', actorId: req.driver.id, ip: req.ip });

  function loadAssignment(req, id) {
    const a = stmtAssignment.get(Number(id), req.driver.id, req.companyId);
    if (!a) throw notFound('Uppdraget finns inte.');
    return a;
  }

  const extractionView = (row) => {
    if (!row) return null;
    const { fields, warnings } = JSON.parse(row.fields_json);
    return { id: row.id, fields, warnings };
  };

  // ── Public: exchange the SMS token for a session ──
  router.post('/session', limiters.login, (req, res) => {
    const { token } = validate(z.object({ token: z.string().max(100) }).strict(), req.body);
    const link = dispatch.redeemLink(token);
    if (!link) throw new HttpError(401, 'link_expired', 'Länken har gått ut eller är ogiltig. Be kontoret skicka en ny.');
    res.json({ token: auth.signDriverToken(link), expires_at: link.expires_at });
  });

  router.use(auth.requireDriver, limiters.api);

  router.get('/me', (req, res) => {
    const me = stmtMe.get(req.driver.id);
    res.json({ name: me.name, company_name: me.company_name, link_expires_at: stmtLinkExpiry.pluck().get(req.driver.linkId) });
  });

  router.get('/assignments', (req, res) => {
    const today = stockholmDate();
    res.json(stmtAssignments.all(req.driver.id, req.companyId, addDays(today, -1), addDays(today, 14)));
  });

  router.get('/assignments/:id', (req, res) => {
    const a = loadAssignment(req, idParam(req.params.id));
    res.json({
      ...a,
      lass: stmtAssignmentLass.all(a.id).map((l) => ({ ...l, farligt_avfall: Boolean(l.farligt_avfall) })),
    });
  });

  router.post('/assignments/:id/hours', (req, res) => {
    const a = loadAssignment(req, idParam(req.params.id));
    const { timmar } = validate(z.object({
      timmar: z.coerce.number().min(0, 'Ange 0–24 timmar.').max(24, 'Ange 0–24 timmar.')
        .refine((n) => Number.isInteger(n * 4), 'Ange timmar i kvartar, t.ex. 7,5.'),
    }).strict(), req.body);
    stmtInsertHours.run(req.companyId, a.id, a.datum, timmar, req.driver.id);
    audit({ ...driverActor(req), entity: 'time_entry', entityId: a.id, action: 'report', after: { datum: a.datum, timmar } });
    res.status(201).json({ timmar });
  });

  // ── Photo of the vågsedel: store, then read it with AI (unless extract=0) ──
  router.post('/photos', limiters.ai, upload.single('photo'), asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Ingen bild bifogad.');
    const a = loadAssignment(req, req.body.assignment_id);
    const { photo, jpeg, duplicate } = await photos.save(req.file.buffer, { companyId: req.companyId, driverId: req.driver.id });

    let extraction = null;
    let aiError = null;
    if (req.body.extract !== '0') {
      const previous = duplicate ? stmtLatestExtraction.get(req.companyId, photo.id) : null;
      if (previous) {
        extraction = extractionView(previous);
      } else {
        try {
          const r = await ai.extractVagsedel({
            companyId: req.companyId, photoId: photo.id, jpeg, assignmentDate: a.datum, assignedRegnr: a.regnr,
          });
          extraction = { id: r.extractionId, fields: r.fields, warnings: r.warnings };
        } catch (err) {
          if (!(err instanceof AiNotConfiguredError || err instanceof AiBudgetExceededError || err instanceof AiExtractionError)) throw err;
          if (err instanceof AiExtractionError) logger.error('[driver] vågsedel extraction failed:', err.reason);
          aiError = AI_MESSAGES[err.code] ?? AI_MESSAGES.ai_extraction_failed;
        }
      }
    }
    res.status(201).json({ photo_id: photo.id, extraction, ai_error: aiError });
  }));

  router.get('/photos/:id', (req, res) => {
    const photo = photos.get(req.params.id, req.companyId);
    if (!photo || photo.uploaded_by_driver_id !== req.driver.id) throw notFound('Bilden finns inte.');
    photos.send(res, photo.id);
  });

  // ── Report a lass ──
  router.post('/lass', (req, res) => {
    const input = validate(lassCreateSchema, req.body);
    const a = loadAssignment(req, input.assignment_id);
    const today = stockholmDate();
    if (input.fields.datum > today) throw badRequest('Datumet kan inte vara i framtiden.', { fields: { 'fields.datum': 'Datumet kan inte vara i framtiden.' } });

    let photoId = null;
    if (input.photo_id) {
      const photo = photos.get(input.photo_id, req.companyId);
      if (!photo || photo.uploaded_by_driver_id !== req.driver.id) throw badRequest('Bilden hittades inte.');
      photoId = photo.id;
    }
    let aiFields = null;
    let extractionId = null;
    if (input.ai_extraction_id && photoId) {
      const row = stmtExtraction.get(input.ai_extraction_id, req.companyId, photoId);
      if (row) { aiFields = JSON.parse(row.fields_json).fields; extractionId = row.id; }
    }

    const values = Object.fromEntries(LASS_FIELDS.map((k) => [k, input.fields[k] ?? null]));
    values.farligt_avfall = Boolean(input.fields.farligt_avfall);
    const slipRegnr = normalizeRegnr(aiFields?.regnr?.value);
    const refs = stmtJobRefs.get(a.job_id);

    const { lass: created, created: isNew } = lass.create({
      companyId: req.companyId, jobId: a.job_id, assignmentId: a.id, clientUuid: input.client_uuid,
      customerId: refs.customer_id, projectId: refs.project_id, vehicleRegnr: a.regnr, driverId: req.driver.id,
      values, photoId, aiExtractionId: extractionId,
      confidence: submittedConfidence(values, aiFields, 'forare'),
      regnrMismatch: Boolean(slipRegnr && slipRegnr !== a.regnr),
      note: input.note ?? null, createdByKind: 'driver', createdByDriverId: req.driver.id,
    });
    // A retried submit returns the original, but only to the driver who created it.
    if (!isNew && created.driver_id !== req.driver.id) throw conflict('duplicate_id', 'Ogiltigt id.');
    if (isNew) audit({ ...driverActor(req), entity: 'lass', entityId: created.lass_id, action: 'create', after: { assignment_id: a.id, review: created.review_status } });
    res.status(isNew ? 201 : 200).json(created);
  });

  // ── Correct own lass until the office has reviewed it ──
  router.post('/lass/:id/versions', (req, res) => {
    const id = idParam(req.params.id);
    const owner = stmtLassOwner.get(id, req.companyId);
    if (!owner || owner.driver_id !== req.driver.id) throw notFound('Lasset finns inte.');
    const prev = lass.current(id, req.companyId);
    if (prev.review_status === 'granskad') throw conflict('reviewed', 'Kontoret har redan granskat lasset. Ring kontoret om något är fel.');
    const input = validate(lassPatchSchema, req.body);
    const updated = lass.addVersion({
      lassId: id, companyId: req.companyId, patch: input.fields, note: input.note,
      changeReason: input.change_reason ?? 'Rättad av föraren', personKind: 'forare',
      createdByKind: 'driver', createdByDriverId: req.driver.id,
    });
    audit({ ...driverActor(req), entity: 'lass', entityId: id, action: 'correct', after: { version: updated.version, fields: Object.keys(input.fields) } });
    res.status(201).json(updated);
  });

  return router;
}
