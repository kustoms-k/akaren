import { Router } from 'express';
import { z } from 'zod';
import { HttpError, asyncHandler, validate, idParam, notFound, conflict, badRequest } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { date, idRef } from '../lib/schemas.js';
import { addDays } from '../lib/dates.js';
import { bookingDays, miljozonOk, shortDateSv } from '../lib/dispatch.js';

const MAX_RANGE_DAYS = 31;

const assignSchema = z.object({
  vehicle_id: idRef,
  driver_id: idRef,
  datum: date,
  // Book every working day from datum to datum_till (weekends and Swedish public holidays are skipped).
  datum_till: date.optional(),
  acknowledge_miljozon: z.boolean().optional(),
  send_sms: z.boolean().optional(),
}).strict();


/** Office: assign vehicles and drivers to jobs, send magic-link SMS. Mounted at /api. */
export function dispatchRouter({ db, audit, dispatch, limiters }) {
  const router = Router();

  const stmtJob = db.prepare(`
    SELECT j.*, p.miljozon, p.name AS project_name FROM jobs j JOIN projects p ON p.id = j.project_id
    WHERE j.id = ? AND j.company_id = ?
  `);
  const stmtVehicle = db.prepare('SELECT * FROM vehicles WHERE id = ? AND company_id = ?');
  const stmtDriver = db.prepare('SELECT * FROM drivers WHERE id = ? AND company_id = ? AND anonymized_at IS NULL');
  const stmtList = db.prepare(`
    SELECT a.id, a.job_id, a.datum, a.miljozon_warning, a.sms_status, a.sms_sent_at, a.created_at, a.cancelled_at,
           v.id AS vehicle_id, v.regnr, v.typ AS vehicle_typ, v.miljozonsklass,
           d.id AS driver_id, d.name AS driver_name,
           (SELECT COUNT(*) FROM lass l WHERE l.assignment_id = a.id) AS lass_count,
           (SELECT t.timmar FROM time_entries t WHERE t.assignment_id = a.id ORDER BY t.id DESC LIMIT 1) AS timmar
    FROM job_assignments a
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN drivers d ON d.id = a.driver_id
    WHERE a.job_id = ? AND a.company_id = ?
    ORDER BY a.cancelled_at IS NOT NULL, a.datum, v.regnr
  `);
  const stmtGet = db.prepare('SELECT * FROM job_assignments WHERE id = ? AND company_id = ?');
  const stmtSame = db.prepare(`
    SELECT 1 FROM job_assignments
    WHERE job_id = ? AND vehicle_id = ? AND driver_id = ? AND datum = ? AND cancelled_at IS NULL
  `);
  const stmtBusy = db.prepare(`
    SELECT a.datum, v.regnr, p.name AS project_name FROM job_assignments a
    JOIN jobs j ON j.id = a.job_id JOIN projects p ON p.id = j.project_id JOIN vehicles v ON v.id = a.vehicle_id
    WHERE a.company_id = ? AND a.vehicle_id = ? AND a.datum = ? AND a.job_id != ? AND a.cancelled_at IS NULL
  `);
  const stmtInsert = db.prepare(`
    INSERT INTO job_assignments (company_id, job_id, vehicle_id, driver_id, datum, miljozon_warning, miljozon_ack_user_id, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtCancel = db.prepare(`
    UPDATE job_assignments SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND cancelled_at IS NULL
  `);
  const stmtLass = db.prepare(`
    SELECT lc.lass_id AS id, lc.version, lc.datum, lc.tid, lc.vagsedel_nr, lc.netto_kg, lc.material, lc.till_namn,
           lc.avfallskod, lc.farligt_avfall, lc.vehicle_regnr, lc.photo_id, lc.review_status, lc.review_reasons_json,
           lc.created_by_kind, lc.corrected_at, d.name AS driver_name
    FROM lass_current lc LEFT JOIN drivers d ON d.id = lc.driver_id
    WHERE lc.job_id = ? AND lc.company_id = ?
    ORDER BY lc.datum DESC, lc.tid DESC, lc.lass_id DESC
  `);

  function loadJob(req) {
    const job = stmtJob.get(idParam(req.params.id), req.companyId);
    if (!job) throw notFound('Uppdraget finns inte.');
    return job;
  }

  router.get('/jobs/:id/assignments', (req, res) => {
    const job = loadJob(req);
    res.json(stmtList.all(job.id, req.companyId));
  });

  router.get('/jobs/:id/lass', (req, res) => {
    const job = loadJob(req);
    res.json(stmtLass.all(job.id, req.companyId).map(({ review_reasons_json, ...l }) => ({
      ...l,
      farligt_avfall: Boolean(l.farligt_avfall),
      review_reasons: review_reasons_json ? JSON.parse(review_reasons_json) : [],
    })));
  });

  router.post('/jobs/:id/assignments', limiters.sms, asyncHandler(async (req, res) => {
    const job = loadJob(req);
    if (!['bekraftad', 'pagar'].includes(job.status)) throw conflict('job_closed', 'Uppdraget är inte aktivt.');
    const input = validate(assignSchema, req.body);
    const vehicle = stmtVehicle.get(input.vehicle_id, req.companyId);
    const driver = stmtDriver.get(input.driver_id, req.companyId);
    if (!vehicle || !vehicle.active) throw badRequest('Fordonet finns inte eller är inte i trafik.', { fields: { vehicle_id: 'Välj ett fordon i trafik.' } });
    if (!driver || !driver.active) throw badRequest('Föraren finns inte eller är inaktiv.', { fields: { driver_id: 'Välj en aktiv förare.' } });
    if (input.datum_till) {
      if (input.datum_till < input.datum) throw badRequest('Slutdatumet är före startdatumet.', { fields: { datum_till: 'Välj ett datum efter startdatumet.' } });
      if (addDays(input.datum, MAX_RANGE_DAYS) < input.datum_till) {
        throw badRequest(`Högst ${MAX_RANGE_DAYS} dagar åt gången.`, { fields: { datum_till: `Högst ${MAX_RANGE_DAYS} dagar åt gången.` } });
      }
    }
    const days = bookingDays(input.datum, input.datum_till);
    if (!days.length) throw badRequest('Det finns inga arbetsdagar i perioden.', { fields: { datum_till: 'Inga arbetsdagar i perioden.' } });
    const skipped = days.filter((d) => stmtSame.get(job.id, vehicle.id, driver.id, d));
    const toBook = days.filter((d) => !skipped.includes(d));
    if (!toBook.length) {
      throw conflict('duplicate_assignment', days.length === 1
        ? `${vehicle.regnr} med ${driver.name} är redan tilldelad den dagen.`
        : `${vehicle.regnr} med ${driver.name} är redan tilldelad alla dagarna.`);
    }

    // Static miljözon check: the vehicle must meet the project's zone class.
    const zoneOk = miljozonOk(vehicle.miljozonsklass, job.miljozon);
    if (!zoneOk && !input.acknowledge_miljozon) {
      throw new HttpError(409, 'miljozon_warning',
        `${vehicle.regnr} uppfyller inte miljözon klass ${job.miljozon} som gäller för ${job.project_name}.`,
        { vehicle_class: vehicle.miljozonsklass, zone: job.miljozon });
    }

    const ids = db.transaction(() => toBook.map((d) => Number(stmtInsert.run(req.companyId, job.id, vehicle.id, driver.id, d,
      zoneOk ? 0 : 1, zoneOk ? null : req.user.id, req.user.id).lastInsertRowid)))();
    audit({
      ...officeActor(req), entity: 'assignment', entityId: ids[0], action: 'create',
      after: { job_id: job.id, vehicle: vehicle.regnr, driver_id: driver.id, days: toBook, assignment_ids: ids, miljozon_override: !zoneOk },
    });

    // The truck booked elsewhere on the same days: one warning per other project.
    const busy = new Map();
    for (const d of toBook) {
      for (const b of stmtBusy.all(req.companyId, vehicle.id, d, job.id)) {
        if (!busy.has(b.project_name)) busy.set(b.project_name, []);
        busy.get(b.project_name).push(d);
      }
    }
    const warnings = [...busy.entries()].map(([project, ds]) => (ds.length === 1
      ? `${vehicle.regnr} är också bokad på ${project} samma dag.`
      : `${vehicle.regnr} är också bokad på ${project} ${ds.map(shortDateSv).join(', ')}.`));
    const sms = input.send_sms
      ? await dispatch.sendAssignmentSms({
        companyId: req.companyId, assignmentId: ids[0], actor: officeActor(req), untilDate: toBook.length > 1 ? toBook.at(-1) : null,
      })
      : null;
    const list = stmtList.all(job.id, req.companyId);
    const created = list.filter((a) => ids.includes(a.id));
    res.status(201).json({ assignment: created[0], assignments: created, skipped, warnings, sms });
  }));

  router.post('/assignments/:id/send-sms', limiters.sms, asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    res.json(await dispatch.sendAssignmentSms({ companyId: req.companyId, assignmentId: id, actor: officeActor(req) }));
  }));

  // Link for a QR code in the office, without texting the driver.
  router.post('/assignments/:id/link', (req, res) => {
    res.json(dispatch.issueAssignmentLink({ companyId: req.companyId, assignmentId: idParam(req.params.id), actor: officeActor(req) }));
  });

  router.post('/assignments/:id/cancel', (req, res) => {
    const a = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!a) throw notFound('Tilldelningen finns inte.');
    if (stmtCancel.run(a.id).changes === 0) throw conflict('already_cancelled', 'Tilldelningen är redan avbokad.');
    audit({ ...officeActor(req), entity: 'assignment', entityId: a.id, action: 'cancel' });
    res.json({ ok: true });
  });

  return router;
}
