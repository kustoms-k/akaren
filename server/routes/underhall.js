import { Router } from 'express';
import db          from '../db.js';
import { getActiveFleet } from '../lib/fleet.js';

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date(new Date().toISOString().slice(0, 10));
  return Math.round(diff / 86_400_000);
}

function alertLevel(days) {
  if (days === null) return null;
  if (days <= 7)  return 'critical';
  if (days <= 14) return 'warning';
  if (days <= 30) return 'notice';
  return 'ok';
}

// Estimate days until service based on recent km accumulation.
// Uses last 90 days of job routes for this vehicle.
function estimateServiceDays(companyId, vehicleId, serviceKm, currentKm) {
  if (!serviceKm || !currentKm) return null;
  const remaining = serviceKm - currentKm;
  if (remaining <= 0) return 0;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const since = ninetyDaysAgo.toISOString().slice(0, 10);

  const { total_km } = db.prepare(`
    SELECT COALESCE(SUM(q.avstand_km), 0) AS total_km
    FROM jobs j
    JOIN quotes q ON q.id = j.quote_id
    WHERE j.company_id = ?
      AND q.fordon_id = ?
      AND date(j.created_at) >= ?
  `).get(companyId, vehicleId, since);

  const avgDailyKm = total_km / 90;
  if (avgDailyKm < 0.1) return null;
  return Math.round(remaining / avgDailyKm);
}

function buildRecord(row, companyId) {
  const serviceEst = estimateServiceDays(companyId, row.vehicle_id, row.service_km, row.current_km);
  return {
    vehicle_id:          row.vehicle_id,
    besiktning_datum:    row.besiktning_datum,
    forsakring_datum:    row.forsakring_datum,
    adr_datum:           row.adr_datum,
    service_datum:       row.service_datum,
    service_km:          row.service_km,
    current_km:          row.current_km,
    sommar_dack_datum:   row.sommar_dack_datum,
    vinter_dack_datum:   row.vinter_dack_datum,
    updated_at:          row.updated_at,

    // Computed alert fields
    besiktning_days:     daysUntil(row.besiktning_datum),
    forsakring_days:     daysUntil(row.forsakring_datum),
    adr_days:            row.adr_datum ? daysUntil(row.adr_datum) : null,
    service_date_days:   daysUntil(row.service_datum),
    service_est_days:    serviceEst,
    besiktning_level:    alertLevel(daysUntil(row.besiktning_datum)),
    forsakring_level:    alertLevel(daysUntil(row.forsakring_datum)),
    adr_level:           row.adr_datum ? alertLevel(daysUntil(row.adr_datum)) : null,
    service_date_level:  alertLevel(daysUntil(row.service_datum)),
    service_est_level:   serviceEst !== null ? alertLevel(serviceEst) : null,
  };
}

// ── GET / — all maintenance records ──────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const fleet = getActiveFleet(req.companyId);
    const rows  = db.prepare('SELECT * FROM vehicle_maintenance WHERE company_id = ?').all(req.companyId);
    const byId  = Object.fromEntries(rows.map((r) => [r.vehicle_id, r]));

    const result = fleet.map((v) => {
      const row = byId[v.id] ?? {
        vehicle_id: v.id, company_id: req.companyId,
        besiktning_datum: null, forsakring_datum: null, adr_datum: null,
        service_datum: null, service_km: null, current_km: null,
        sommar_dack_datum: null, vinter_dack_datum: null, updated_at: null,
      };
      return { ...v, maintenance: buildRecord(row, req.companyId) };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /alerts — upcoming alerts across fleet ────────────────────────────────
router.get('/alerts', (req, res) => {
  try {
    const fleet = getActiveFleet(req.companyId);
    const rows  = db.prepare('SELECT * FROM vehicle_maintenance WHERE company_id = ?').all(req.companyId);
    const byId  = Object.fromEntries(rows.map((r) => [r.vehicle_id, r]));
    const alerts = [];

    for (const v of fleet) {
      const row = byId[v.id];
      if (!row) continue;
      const rec = buildRecord(row, req.companyId);

      const checks = [
        { type: 'besiktning', label: 'Kontrollbesiktning',  days: rec.besiktning_days,    level: rec.besiktning_level,   datum: rec.besiktning_datum },
        { type: 'forsakring', label: 'Försäkringsförnyelse', days: rec.forsakring_days,   level: rec.forsakring_level,   datum: rec.forsakring_datum },
        { type: 'adr',        label: 'ADR-certifikat',       days: rec.adr_days,           level: rec.adr_level,          datum: rec.adr_datum },
        { type: 'service',    label: 'Servicedatum',         days: rec.service_date_days,  level: rec.service_date_level, datum: rec.service_datum },
        { type: 'service_km', label: 'Serviceintervall (km)', days: rec.service_est_days,  level: rec.service_est_level,  datum: null },
      ];

      for (const c of checks) {
        if (c.level && c.level !== 'ok' && c.days !== null) {
          alerts.push({
            vehicle_id:   v.id,
            vehicle_namn: v.namn,
            type:         c.type,
            label:        c.label,
            days:         c.days,
            level:        c.level,
            datum:        c.datum,
          });
        }
      }
    }

    alerts.sort((a, b) => a.days - b.days);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /costs — maintenance cost log ────────────────────────────────────────
router.get('/costs', (req, res) => {
  try {
    const costs = db.prepare(
      'SELECT * FROM maintenance_costs WHERE company_id = ? ORDER BY datum DESC, id DESC'
    ).all(req.companyId);

    // Per-vehicle cost summary
    const fleet = getActiveFleet(req.companyId);
    const summary = fleet.map((v) => {
      const vCosts = costs.filter((c) => c.vehicle_id === v.id);
      const total  = vCosts.reduce((s, c) => s + c.belopp_sek, 0);
      const row    = db.prepare('SELECT current_km FROM vehicle_maintenance WHERE company_id = ? AND vehicle_id = ?')
                       .get(req.companyId, v.id);
      const currentKm = row?.current_km ?? null;
      return {
        vehicle_id:   v.id,
        vehicle_namn: v.namn,
        total_sek:    Math.round(total),
        cost_per_km:  currentKm && currentKm > 0 ? Math.round((total / currentKm) * 100) / 100 : null,
        current_km:   currentKm,
        entries:      vCosts.length,
      };
    });

    res.json({ costs, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /costs — log a new maintenance cost ──────────────────────────────────
router.post('/costs', (req, res) => {
  const { vehicle_id, typ, beskrivning, belopp_sek, datum, km_vid_service } = req.body;
  if (!vehicle_id || !typ || !belopp_sek || !datum) {
    return res.status(400).json({ error: 'vehicle_id, typ, belopp_sek, datum required' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO maintenance_costs (company_id, vehicle_id, typ, beskrivning, belopp_sek, datum, km_vid_service)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.companyId, vehicle_id, typ, beskrivning ?? null, Number(belopp_sek), datum, km_vid_service ?? null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /costs/:id ─────────────────────────────────────────────────────────
router.delete('/costs/:id', (req, res) => {
  const result = db.prepare(
    'DELETE FROM maintenance_costs WHERE id = ? AND company_id = ?'
  ).run(Number(req.params.id), req.companyId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── PUT /:vehicleId — update maintenance dates ────────────────────────────────
router.put('/:vehicleId', (req, res) => {
  const { vehicleId } = req.params;
  const {
    besiktning_datum, forsakring_datum, adr_datum,
    service_datum, service_km, current_km,
    sommar_dack_datum, vinter_dack_datum,
  } = req.body;

  try {
    db.prepare(`
      INSERT INTO vehicle_maintenance
        (company_id, vehicle_id, besiktning_datum, forsakring_datum, adr_datum,
         service_datum, service_km, current_km, sommar_dack_datum, vinter_dack_datum, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id, vehicle_id) DO UPDATE SET
        besiktning_datum  = excluded.besiktning_datum,
        forsakring_datum  = excluded.forsakring_datum,
        adr_datum         = excluded.adr_datum,
        service_datum     = excluded.service_datum,
        service_km        = excluded.service_km,
        current_km        = excluded.current_km,
        sommar_dack_datum = excluded.sommar_dack_datum,
        vinter_dack_datum = excluded.vinter_dack_datum,
        updated_at        = CURRENT_TIMESTAMP
    `).run(
      req.companyId, vehicleId,
      besiktning_datum  ?? null,
      forsakring_datum  ?? null,
      adr_datum         ?? null,
      service_datum     ?? null,
      service_km        ?? null,
      current_km        ?? null,
      sommar_dack_datum ?? null,
      vinter_dack_datum ?? null,
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
