import { Router } from 'express';
import { badRequest } from '../lib/http.js';
import { addDays, isValidDate, stockholmDate } from '../lib/dates.js';
import { isWorkday } from '../lib/workdays.js';

/**
 * The day board (/api/board?datum=YYYY-MM-DD, default today): where every truck is, what it has logged, which
 * trucks and drivers are free, and which active jobs run that day without a truck. Read-only.
 */
export function boardRouter({ db }) {
  const router = Router();

  const stmt = {
    vehicles: db.prepare('SELECT id, regnr, typ, miljozonsklass FROM vehicles WHERE company_id = ? AND active = 1 ORDER BY regnr'),
    drivers: db.prepare('SELECT id, name FROM drivers WHERE company_id = ? AND active = 1 AND anonymized_at IS NULL ORDER BY name'),
    assignments: db.prepare(`
      SELECT a.id, a.job_id, a.vehicle_id, a.driver_id, a.sms_status, a.miljozon_warning,
             d.name AS driver_name, j.uppdragstyp, j.tid, j.material, j.status AS job_status,
             c.name AS customer_name, p.name AS project_name,
             (SELECT COUNT(*) FROM lass_current lc WHERE lc.assignment_id = a.id AND lc.datum = a.datum) AS lass_count,
             (SELECT COALESCE(SUM(lc.netto_kg), 0) FROM lass_current lc WHERE lc.assignment_id = a.id AND lc.datum = a.datum) AS netto_kg,
             (SELECT MAX(lc.tid) FROM lass_current lc WHERE lc.assignment_id = a.id AND lc.datum = a.datum) AS last_lass_tid,
             (SELECT COUNT(*) FROM lass_current lc WHERE lc.assignment_id = a.id AND lc.datum = a.datum
                AND lc.review_status = 'behover_granskas') AS to_review,
             (SELECT t.timmar FROM time_entries t WHERE t.assignment_id = a.id AND t.datum = a.datum ORDER BY t.id DESC LIMIT 1) AS timmar
      FROM job_assignments a
      JOIN drivers d ON d.id = a.driver_id
      JOIN jobs j ON j.id = a.job_id
      JOIN customers c ON c.id = j.customer_id
      JOIN projects p ON p.id = j.project_id
      WHERE a.company_id = ? AND a.datum = ? AND a.cancelled_at IS NULL AND j.status != 'avbruten'
      ORDER BY j.tid, a.id`),
    // Active jobs that run on the day (single-day jobs on their date, ranges inclusive) without an assignment.
    // A range only runs on workdays, as booking does (lib/dispatch.js bookingDays); see the filter in the route.
    uncovered: db.prepare(`
      SELECT j.id, j.uppdragstyp, j.material, j.tid, j.datum_fran, j.datum_till, j.antal_lass,
             c.name AS customer_name, p.name AS project_name
      FROM jobs j
      JOIN customers c ON c.id = j.customer_id
      JOIN projects p ON p.id = j.project_id
      WHERE j.company_id = @cid AND j.status IN ('bekraftad', 'pagar')
        AND j.datum_fran <= @datum AND COALESCE(j.datum_till, j.datum_fran) >= @datum
        AND NOT EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.id AND a.datum = @datum AND a.cancelled_at IS NULL)
      ORDER BY j.tid, j.id`),
  };

  router.get('/', (req, res) => {
    const datum = req.query.datum ?? stockholmDate();
    if (!isValidDate(datum)) throw badRequest('Ogiltigt datum.');
    const assignments = stmt.assignments.all(req.companyId, datum);
    const byVehicle = new Map();
    for (const a of assignments) {
      if (!byVehicle.has(a.vehicle_id)) byVehicle.set(a.vehicle_id, []);
      byVehicle.get(a.vehicle_id).push({ ...a, miljozon_warning: Boolean(a.miljozon_warning) });
    }
    const vehicles = stmt.vehicles.all(req.companyId).map((v) => ({ ...v, assignments: byVehicle.get(v.id) ?? [] }));
    // Busy trucks first, in the order their first job starts; free trucks last.
    vehicles.sort((a, b) => (b.assignments.length > 0) - (a.assignments.length > 0)
      || String(a.assignments[0]?.tid ?? '').localeCompare(String(b.assignments[0]?.tid ?? '')) || a.regnr.localeCompare(b.regnr));
    const busyDrivers = new Set(assignments.map((a) => a.driver_id));
    const sum = (f) => assignments.reduce((s, a) => s + f(a), 0);
    res.json({
      datum,
      previous: addDays(datum, -1),
      next: addDays(datum, 1),
      vehicles,
      free_drivers: stmt.drivers.all(req.companyId).filter((d) => !busyDrivers.has(d.id)),
      uncovered: stmt.uncovered.all({ cid: req.companyId, datum })
        .filter((j) => !j.datum_till || j.datum_till === j.datum_fran || isWorkday(datum)),
      totals: {
        vehicles: vehicles.length,
        vehicles_out: vehicles.filter((v) => v.assignments.length).length,
        assignments: assignments.length,
        lass: sum((a) => a.lass_count),
        netto_kg: sum((a) => a.netto_kg),
        to_review: sum((a) => a.to_review),
      },
    });
  });

  return router;
}
