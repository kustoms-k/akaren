import { Router } from 'express';
import db from '../db.js';

const router = Router();

// ── CO2 emission factors (kg CO2e per km, loaded one-way)
// Source: Trafikanalys "Lastbilstrafik 2024", NTMCalc 4.0, HBEFA 4.2
// Figures for heavy diesel trucks (>16t) operating in Sweden 2024/2026.
// Range 0.80–1.10 kg CO2/km aligns with Trafikanalys riksgenomsnitt ~0.94 kg/km.
const EMISSION_FACTORS = {
  'Kranlyft':          1.08,   // Crane truck >32t, diesel Euro VI
  'Grävmaskin':        1.05,   // Heavy flatbed/crane, loaded >20t
  'Containertransport':0.92,   // Container truck 26t, Euro VI
  'Betongtransport':   0.98,   // Concrete mixer/bulk, heavy
  'Båttransport':      0.85,   // Flatbed, boat transport, medium load
  'Godstransport':     0.88,   // Standard goods 18–26t, Euro VI (Trafikanalys avg)
  'Lastväxlare':       0.90,   // Hook-lift, 18t
  'Frakt':             0.94,   // Truck+trailer 40t (Trafikanalys riksgenomsnitt)
  default:             0.90,   // Conservative default, Trafikanalys heavy truck avg
};

// Return factor for vehicle or cargo type
function emissionFactor(lasttyp) {
  return EMISSION_FACTORS[lasttyp] ?? EMISSION_FACTORS.default;
}

// kg CO2e for a job: factor × distance × 2 (round trip)
function calcCo2(avstand_km, lasttyp) {
  if (!avstand_km || avstand_km <= 0) return null;
  return Math.round(emissionFactor(lasttyp) * avstand_km * 2 * 10) / 10;
}

// ── GET /api/co2/summary — per-month CO2 summary for the company ──────────
router.get('/summary', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        strftime('%Y-%m', j.created_at) AS month,
        COUNT(*)                        AS job_count,
        SUM(q.avstand_km)               AS total_km,
        GROUP_CONCAT(q.lasttyp)         AS cargo_types,
        SUM(q.totalpris_sek)            AS revenue
      FROM jobs j
      JOIN quotes q ON q.id = j.quote_id
      WHERE j.company_id = ?
        AND q.avstand_km IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all(req.companyId);

    const summary = rows.map((r) => {
      const types  = (r.cargo_types ?? '').split(',');
      // Weighted average factor across cargo types in the month
      const avgFactor = types.reduce((sum, t) => sum + emissionFactor(t.trim()), 0) / types.length;
      const co2_kg    = Math.round(avgFactor * (r.total_km ?? 0) * 2 * 10) / 10;
      return {
        month:     r.month,
        job_count: r.job_count,
        total_km:  Math.round(r.total_km ?? 0),
        co2_kg,
        co2_tonnes: Math.round(co2_kg / 100) / 10,
        revenue:   r.revenue ?? 0,
        // Intensity: kg CO2 per 1 000 kr revenue (lower = better)
        intensity: r.revenue > 0 ? Math.round((co2_kg / r.revenue) * 1000 * 10) / 10 : null,
      };
    });

    // Rolling 12-month totals
    const total_co2_kg  = summary.reduce((s, r) => s + r.co2_kg, 0);
    const total_km      = summary.reduce((s, r) => s + r.total_km, 0);
    const total_revenue = summary.reduce((s, r) => s + r.revenue, 0);

    // Industry benchmark: average Swedish åkeri ≈ 0.94 kg CO2/km (Trafikanalys "Lastbilstrafik 2024", heavy diesel)
    const benchmark_kg  = Math.round(total_km * 2 * 0.94 * 10) / 10;
    const vs_benchmark_pct = benchmark_kg > 0
      ? Math.round(((total_co2_kg - benchmark_kg) / benchmark_kg) * 1000) / 10
      : null;

    res.json({
      months: summary,
      totals: {
        co2_kg:          Math.round(total_co2_kg * 10) / 10,
        co2_tonnes:      Math.round(total_co2_kg / 100) / 10,
        total_km,
        total_revenue,
        vs_benchmark_pct,
        benchmark_kg,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/co2/by-cargo — CO2 breakdown by cargo type ──────────────────
router.get('/by-cargo', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        q.lasttyp,
        COUNT(*)         AS job_count,
        SUM(q.avstand_km) AS total_km
      FROM jobs j
      JOIN quotes q ON q.id = j.quote_id
      WHERE j.company_id = ? AND q.avstand_km IS NOT NULL AND q.lasttyp IS NOT NULL
      GROUP BY q.lasttyp
      ORDER BY total_km DESC
    `).all(req.companyId);

    const result = rows.map((r) => ({
      lasttyp:    r.lasttyp,
      job_count:  r.job_count,
      total_km:   Math.round(r.total_km ?? 0),
      factor:     emissionFactor(r.lasttyp),
      co2_kg:     Math.round(emissionFactor(r.lasttyp) * (r.total_km ?? 0) * 2 * 10) / 10,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/co2/certificate/:month — generate certificate data ───────────
router.get('/certificate/:month', (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Invalid month format' });

  try {
    const company = db.prepare('SELECT name, org_nr FROM companies WHERE id = ?').get(req.companyId);
    const rows = db.prepare(`
      SELECT q.avstand_km, q.lasttyp, q.totalpris_sek, q.leverans, q.upphämtning
      FROM jobs j
      JOIN quotes q ON q.id = j.quote_id
      WHERE j.company_id = ? AND strftime('%Y-%m', j.created_at) = ?
        AND q.avstand_km IS NOT NULL
    `).all(req.companyId, month);

    const total_km  = rows.reduce((s, r) => s + (r.avstand_km ?? 0), 0);
    const co2_items = rows.map((r) => ({
      ...r,
      co2_kg: calcCo2(r.avstand_km, r.lasttyp),
    }));
    const total_co2_kg = co2_items.reduce((s, r) => s + (r.co2_kg ?? 0), 0);

    res.json({
      company:       company?.name ?? 'Okänt företag',
      org_nr:        company?.org_nr ?? '',
      month,
      job_count:     rows.length,
      total_km:      Math.round(total_km),
      co2_kg:        Math.round(total_co2_kg * 10) / 10,
      co2_tonnes:    Math.round(total_co2_kg / 100) / 10,
      methodology:   'NTMCalc + Trafikanalys 2024 emission factors',
      generated_at:  new Date().toISOString(),
      jobs:          co2_items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
