import { Router } from 'express';
import db from '../db.js';

const router = Router();

// EU 561/2006 limits (minutes)
const DAILY_MAX  = 9  * 60;   // 540 min — 9 h normal daily limit
const WEEKLY_MAX = 56 * 60;   // 3 360 min — 56 h weekly limit
const FORT_MAX   = 90 * 60;   // 5 400 min — 90 h fortnightly limit
const AMBER_PCT  = 0.80;
const RED_PCT    = 0.95;

function statusOf(used, max) {
  const p = used / max;
  if (p >= RED_PCT)   return 'red';
  if (p >= AMBER_PCT) return 'amber';
  return 'green';
}

// ISO week starts on Monday
function weekStartFor(isoDate) {
  const d   = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sun
  const off = day === 0 ? -6 : 1 - day;
  return new Date(d.getTime() + off * 86_400_000).toISOString().slice(0, 10);
}

// Prepared statements (created once, reused)
const stmtDrivers  = db.prepare('SELECT id, name, phone, truck_id FROM drivers WHERE company_id = ? ORDER BY truck_id');
const stmtOneDriver = db.prepare('SELECT id, name, truck_id FROM drivers WHERE id = ? AND company_id = ?');
const stmtDay      = db.prepare('SELECT COALESCE(SUM(driving_minutes),0) AS total FROM driver_hours WHERE company_id=? AND driver_id=? AND date=?');
const stmtRange    = db.prepare('SELECT COALESCE(SUM(driving_minutes),0) AS total FROM driver_hours WHERE company_id=? AND driver_id=? AND date>=?');
const stmtInsert   = db.prepare(`
  INSERT INTO driver_hours (company_id, driver_id, job_id, date, driving_minutes, work_minutes, rest_minutes, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// ── GET / — compliance status for all drivers ─────────────────────────────────
router.get('/', (req, res) => {
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const weekStart = weekStartFor(today);
    // Fortnight = this week + previous week
    const fortStart = new Date(
      new Date(weekStart + 'T00:00:00Z').getTime() - 7 * 86_400_000
    ).toISOString().slice(0, 10);

    const drivers = stmtDrivers.all(req.companyId);

    const result = drivers.map((d) => {
      const todayMin = stmtDay.get(req.companyId, d.id, today).total;
      const weekMin  = stmtRange.get(req.companyId, d.id, weekStart).total;
      const fortMin  = stmtRange.get(req.companyId, d.id, fortStart).total;

      return {
        id:       d.id,
        name:     d.name,
        truck_id: d.truck_id,
        phone:    d.phone,
        today: {
          driving_minutes:   todayMin,
          limit_minutes:     DAILY_MAX,
          pct:               Math.min(100, Math.round(todayMin / DAILY_MAX * 100)),
          status:            statusOf(todayMin, DAILY_MAX),
          remaining_minutes: Math.max(0, DAILY_MAX - todayMin),
        },
        week: {
          driving_minutes:   weekMin,
          limit_minutes:     WEEKLY_MAX,
          pct:               Math.min(100, Math.round(weekMin / WEEKLY_MAX * 100)),
          status:            statusOf(weekMin, WEEKLY_MAX),
          remaining_minutes: Math.max(0, WEEKLY_MAX - weekMin),
        },
        fortnight: {
          driving_minutes: fortMin,
          limit_minutes:   FORT_MAX,
          pct:             Math.min(100, Math.round(fortMin / FORT_MAX * 100)),
          status:          statusOf(fortMin, FORT_MAX),
        },
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /check — pre-dispatch compliance check ────────────────────────────────
// Query: ?driver_id=1&estimated_minutes=95
router.get('/check', (req, res) => {
  const { driver_id, estimated_minutes } = req.query;
  if (!driver_id || !estimated_minutes) {
    return res.status(400).json({ error: 'driver_id and estimated_minutes required' });
  }

  const driverId = Number(driver_id);
  const estMin   = Number(estimated_minutes);

  try {
    const driver = stmtOneDriver.get(driverId, req.companyId);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const today     = new Date().toISOString().slice(0, 10);
    const weekStart = weekStartFor(today);

    const todayMin = stmtDay.get(req.companyId, driverId, today).total;
    const weekMin  = stmtRange.get(req.companyId, driverId, weekStart).total;

    const dailyAfter  = todayMin + estMin;
    const weeklyAfter = weekMin  + estMin;

    const violations = [];
    if (dailyAfter > DAILY_MAX) {
      violations.push({
        rule:            'daily',
        current_minutes: todayMin,
        estimated:       estMin,
        after:           dailyAfter,
        limit:           DAILY_MAX,
        excess_minutes:  dailyAfter - DAILY_MAX,
      });
    }
    if (weeklyAfter > WEEKLY_MAX) {
      violations.push({
        rule:            'weekly',
        current_minutes: weekMin,
        estimated:       estMin,
        after:           weeklyAfter,
        limit:           WEEKLY_MAX,
        excess_minutes:  weeklyAfter - WEEKLY_MAX,
      });
    }

    res.json({
      ok:                violations.length === 0,
      driver_name:       driver.name,
      estimated_minutes: estMin,
      today_current:     todayMin,
      week_current:      weekMin,
      daily_after:       dailyAfter,
      weekly_after:      weeklyAfter,
      violations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:driverId/log — manual / auto hour logging ─────────────────────────
router.post('/:driverId/log', (req, res) => {
  const driverId = Number(req.params.driverId);
  const { date, driving_minutes, work_minutes, rest_minutes, job_id, source } = req.body;

  if (!date || driving_minutes == null) {
    return res.status(400).json({ error: 'date and driving_minutes required' });
  }

  try {
    const driver = db.prepare('SELECT id FROM drivers WHERE id = ? AND company_id = ?').get(driverId, req.companyId);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const ins = stmtInsert.run(
      req.companyId,
      driverId,
      job_id   ?? null,
      date,
      Number(driving_minutes),
      Number(work_minutes  ?? 0),
      Number(rest_minutes  ?? 0),
      source   ?? 'manual',
    );

    res.status(201).json({ id: ins.lastInsertRowid, ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
