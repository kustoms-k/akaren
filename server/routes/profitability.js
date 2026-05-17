import { Router }      from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path             from 'node:path';
import db               from '../db.js';

const router    = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fleet     = JSON.parse(readFileSync(path.join(__dirname, '../data/fleet.json'), 'utf8'));

function lookupVehicle(fordonId) {
  if (!fordonId) return null;
  const up = String(fordonId).trim().toUpperCase();
  const lo = String(fordonId).trim().toLowerCase();
  return (
    fleet.find((v) => v.id.toUpperCase() === up) ??
    fleet.find((v) => v.namn.toLowerCase() === lo) ??
    fleet.find((v) => lo.includes(v.namn.toLowerCase()) || v.namn.toLowerCase().includes(lo)) ??
    null
  );
}

function hoursEst(avstand_km) { return (Number(avstand_km) || 0) / 70 + 1.5; }

function costEst(vehicle, avstand_km) {
  if (!vehicle) return null;
  const km = Number(avstand_km) || 0;
  return vehicle.startavgift_sek + vehicle.priskm_sek * km + vehicle.timkostnad_sek * hoursEst(km);
}

function marginPct(intakt, kostnad) {
  if (!intakt || intakt === 0 || kostnad == null) return null;
  return ((intakt - kostnad) / intakt) * 100;
}

const stmtJobs = db.prepare(`
  SELECT
    j.id              AS job_id,
    j.status          AS job_status,
    j.faktura_nr      AS faktura_nr,
    j.created_at      AS job_created_at,
    q.id              AS quote_raw_id,
    q.upphämtning,
    q.leverans,
    q.lasttyp,
    q.datum,
    q.avstand_km,
    q.totalpris_sek,
    q.fordon_id
  FROM jobs j
  JOIN quotes q ON q.id = j.quote_id
  WHERE j.company_id = ? AND strftime('%Y-%m', j.created_at) = ?
  ORDER BY j.created_at DESC
`);

router.get('/', (req, res) => {
  const month = req.query.month ?? new Date().toISOString().slice(0, 7);

  try {
    const rows = stmtJobs.all(req.companyId, month);

    const jobs = rows.map((r) => {
      const vehicle = lookupVehicle(r.fordon_id);
      const kostnad = costEst(vehicle, r.avstand_km);
      const margin  = marginPct(r.totalpris_sek, kostnad);
      return {
        job_id:       r.job_id,
        job_status:   r.job_status,
        faktura_nr:   r.faktura_nr ?? null,
        kund:         r.upphämtning ?? '—',
        leverans:     r.leverans    ?? '—',
        lasttyp:      r.lasttyp     ?? '—',
        datum:        r.datum       ?? null,
        avstand_km:   r.avstand_km,
        intakt:       r.totalpris_sek,
        kostnad:      kostnad != null ? Math.round(kostnad) : null,
        marginal_pct: margin  != null ? Math.round(margin * 10) / 10 : null,
        fordon_id:    r.fordon_id ?? '—',
        created_at:   r.job_created_at,
      };
    });

    jobs.sort((a, b) => {
      if (a.marginal_pct == null && b.marginal_pct == null) return 0;
      if (a.marginal_pct == null) return 1;
      if (b.marginal_pct == null) return -1;
      return a.marginal_pct - b.marginal_pct;
    });

    const profitByKund = {};
    for (const j of jobs) {
      const profit = j.intakt != null && j.kostnad != null ? j.intakt - j.kostnad : 0;
      profitByKund[j.kund] = (profitByKund[j.kund] ?? 0) + profit;
    }
    const customerRanking = Object.entries(profitByKund)
      .map(([kund, profit]) => ({ kund, profit: Math.round(profit) }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const hoursByVehicle = {};
    for (const r of rows) {
      if (!r.fordon_id) continue;
      const v   = lookupVehicle(r.fordon_id);
      const key = v ? v.id : r.fordon_id;
      hoursByVehicle[key] = (hoursByVehicle[key] ?? 0) + hoursEst(r.avstand_km);
    }
    const AVAILABLE_HOURS = 160;
    const truckUtilisation = fleet.map((v) => {
      const assigned = Math.round((hoursByVehicle[v.id] ?? 0) * 10) / 10;
      return {
        id:             v.id,
        namn:           v.namn,
        typ:            v.typ,
        assignedHours:  assigned,
        availableHours: AVAILABLE_HOURS,
        pct:            Math.round((assigned / AVAILABLE_HOURS) * 1000) / 10,
      };
    });

    res.json({ month, jobs, customerRanking, truckUtilisation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
