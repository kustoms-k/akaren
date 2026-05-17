import { Router }         from 'express';
import { getActiveFleet } from '../lib/fleet.js';
import db                 from '../db.js';

const router = Router();

const stmtFleetJobs = db.prepare(`
  SELECT q.fordon_id, q.totalpris_sek, q.avstand_km
  FROM jobs j
  JOIN quotes q ON q.id = j.quote_id
  WHERE strftime('%Y-%m', j.created_at) = ?
    AND q.fordon_id IS NOT NULL
    AND j.company_id = ?
`);

const stmtInsertTruck = db.prepare(`
  INSERT INTO company_fleet
    (company_id, ext_id, reg, namn, lasttyp, typ, max_last_kg, volym_m3,
     lez_godkand, euro_klass, timkostnad_sek, tillstand, priskm_sek, startavgift_sek, beskrivning)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtDeleteTruck = db.prepare(
  'DELETE FROM company_fleet WHERE id = ? AND company_id = ?'
);

function hoursEst(avstand_km) {
  return (Number(avstand_km) || 0) / 70 + 1.5;
}

// ── GET /stats?month=YYYY-MM ──────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const month = req.query.month ?? new Date().toISOString().slice(0, 7);
  try {
    const fleet   = getActiveFleet(req.companyId);
    const rows    = stmtFleetJobs.all(month, req.companyId);
    const revenue = {}, cost = {}, hours = {};

    for (const r of rows) {
      const v   = fleet.find((f) => f.id.toUpperCase() === String(r.fordon_id).toUpperCase());
      const key = v ? v.id : r.fordon_id;
      const km  = Number(r.avstand_km) || 0;
      const h   = hoursEst(km);
      const c   = v ? v.startavgift_sek + v.priskm_sek * km + v.timkostnad_sek * h : 0;

      revenue[key] = (revenue[key] ?? 0) + (Number(r.totalpris_sek) || 0);
      cost[key]    = (cost[key]    ?? 0) + c;
      hours[key]   = (hours[key]   ?? 0) + h;
    }

    res.json(fleet.map((v) => {
      const h   = hours[v.id];
      const rev = revenue[v.id] ?? 0;
      const cst = cost[v.id]    ?? 0;
      return {
        ...v,
        monthly_revenue: Math.round(rev),
        monthly_hours:   h != null ? Math.round(h * 10) / 10 : 0,
        profit_per_hour: h ? Math.round((rev - cst) / h) : null,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — full fleet list ───────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json(getActiveFleet(req.companyId));
});

// ── GET /:id — single vehicle ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const vehicle = getActiveFleet(req.companyId).find((v) => v.id === req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Fordon ej hittat' });
  res.json(vehicle);
});

// ── POST / — add truck to company_fleet ───────────────────────────────────────
router.post('/', (req, res) => {
  const {
    ext_id, reg, namn, lasttyp, typ,
    max_last_kg, volym_m3, lez_godkand, euro_klass,
    timkostnad_sek, tillstand, priskm_sek, startavgift_sek, beskrivning,
  } = req.body;
  if (!namn?.trim() || !typ?.trim()) {
    return res.status(400).json({ error: 'namn and typ required' });
  }
  const result = stmtInsertTruck.run(
    req.companyId,
    ext_id  || null,
    reg     || null,
    namn.trim(),
    lasttyp || null,
    typ.trim(),
    max_last_kg     ?? null,
    volym_m3        ?? null,
    lez_godkand     ? 1 : 0,
    euro_klass      ?? null,
    timkostnad_sek  ?? 750,
    tillstand       ? JSON.stringify(tillstand) : null,
    priskm_sek      ?? 18,
    startavgift_sek ?? 500,
    beskrivning     || null,
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

// ── DELETE /:id — remove truck from company_fleet ────────────────────────────
router.delete('/:id', (req, res) => {
  const result = stmtDeleteTruck.run(Number(req.params.id), req.companyId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
