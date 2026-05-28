import { Router } from 'express';
import db from '../db.js';

const router = Router();

const COST_PER_KM = 7.5; // kr/km deadhead cost (fuel + wear estimate)
const DATE_WINDOW = 4;   // ±days window for compatible dates

function cityOf(addr) {
  if (!addr) return null;
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  return (parts[parts.length - 1] ?? addr).toLowerCase();
}

function cityScore(deliveryAddr, pickupAddr) {
  const a = cityOf(deliveryAddr);
  const b = cityOf(pickupAddr);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.startsWith(b) || b.startsWith(a)) return 0.75;
  const wa = a.split(/\s+/)[0];
  const wb = b.split(/\s+/)[0];
  if (wa && wb && wa === wb && wa.length > 4) return 0.6;
  return 0;
}

// ── GET /stats — fleet-wide empty miles for dashboard ─────────────────────────
router.get('/stats', (req, res) => {
  try {
    const d          = new Date();
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

    const jobs = db.prepare(`
      SELECT j.id, q.avstand_km
      FROM jobs j
      LEFT JOIN quotes q ON q.id = j.quote_id AND q.company_id = j.company_id
      WHERE j.company_id = ? AND j.created_at >= ?
    `).all(req.companyId, monthStart);

    const pairs = db.prepare(`
      SELECT jp.job_id_a, jp.job_id_b,
             qa.avstand_km AS km_a, qb.avstand_km AS km_b
      FROM job_pairs jp
      LEFT JOIN jobs ja ON ja.id = jp.job_id_a
      LEFT JOIN jobs jb ON jb.id = jp.job_id_b
      LEFT JOIN quotes qa ON qa.id = ja.quote_id AND qa.company_id = ja.company_id
      LEFT JOIN quotes qb ON qb.id = jb.quote_id AND qb.company_id = jb.company_id
      WHERE jp.company_id = ? AND jp.linked_at >= ?
    `).all(req.companyId, monthStart);

    const pairedIds  = new Set(pairs.flatMap(p => [p.job_id_a, p.job_id_b]));
    const totalKm    = jobs.reduce((s, j) => s + (Number(j.avstand_km) || 0), 0);
    const deadheadKm = jobs
      .filter(j => !pairedIds.has(j.id))
      .reduce((s, j) => s + (Number(j.avstand_km) || 0), 0);

    let recoveredKm = 0;
    for (const p of pairs) {
      recoveredKm += Math.min(Number(p.km_a) || 0, Number(p.km_b) || 0);
    }

    res.json({
      total_km:      Math.round(totalKm),
      deadhead_km:   Math.round(deadheadKm),
      recovered_km:  Math.round(recoveredKm),
      deadhead_sek:  Math.round(deadheadKm  * COST_PER_KM),
      recovered_sek: Math.round(recoveredKm * COST_PER_KM),
      pair_count:    pairs.length,
      job_count:     jobs.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:jobId — return load candidates for a specific job ───────────────────
router.get('/:jobId', (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

  try {
    const job = db.prepare(`
      SELECT j.id, j.status,
             q.upphämtning, q.leverans, q.datum, q.avstand_km,
             q.totalpris_sek, q.lasttyp, q.fordon_id
      FROM jobs j
      LEFT JOIN quotes q ON q.id = j.quote_id AND q.company_id = j.company_id
      WHERE j.id = ? AND j.company_id = ?
    `).get(jobId, req.companyId);

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const paired = db.prepare(
      'SELECT id FROM job_pairs WHERE company_id=? AND (job_id_a=? OR job_id_b=?)'
    ).get(req.companyId, jobId, jobId);

    if (paired) return res.json({ matches: [], already_paired: true });

    const candidates = db.prepare(`
      SELECT q.id AS quote_id,
             q.upphämtning, q.leverans, q.datum, q.avstand_km,
             q.totalpris_sek, q.lasttyp, q.fordon_id,
             j2.id AS job_id, j2.status AS job_status
      FROM quotes q
      LEFT JOIN jobs j2     ON j2.quote_id = q.id AND j2.company_id = q.company_id
      LEFT JOIN job_pairs p ON p.company_id = q.company_id
                             AND (p.job_id_a = j2.id OR p.job_id_b = j2.id)
      WHERE q.company_id = ?
        AND q.upphämtning IS NOT NULL
        AND q.id != COALESCE((SELECT quote_id FROM jobs WHERE id = ? AND company_id = ?), -1)
        AND p.id IS NULL
    `).all(req.companyId, jobId, req.companyId);

    const jobDate = job.datum ? new Date(job.datum) : null;
    const matches = [];

    for (const c of candidates) {
      const score = cityScore(job.leverans, c.upphämtning);
      if (score < 0.5) continue;

      if (jobDate && c.datum) {
        const diffDays = Math.abs(new Date(c.datum) - jobDate) / 86_400_000;
        if (diffDays > DATE_WINDOW * 2) continue;
      }

      const eliminatedKm   = Number(job.avstand_km)    || 0;
      const extraRevenue   = Number(c.totalpris_sek)   || 0;
      const primaryRevenue = Number(job.totalpris_sek) || 0;
      const savedSek       = Math.round(eliminatedKm * COST_PER_KM);

      matches.push({
        quote_id:            c.quote_id,
        job_id:              c.job_id ?? null,
        upphämtning:         c.upphämtning,
        leverans:            c.leverans,
        lasttyp:             c.lasttyp,
        datum:               c.datum,
        avstand_km:          c.avstand_km,
        totalpris_sek:       extraRevenue,
        city_score:          score,
        empty_km_eliminated: Math.round(eliminatedKm),
        saved_sek:           savedSek,
        combined_revenue:    primaryRevenue + extraRevenue + savedSek,
      });
    }

    matches.sort((a, b) => b.combined_revenue - a.combined_revenue);
    res.json({ matches: matches.slice(0, 5), already_paired: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /link — pair job + quote into a return-load route ────────────────────
router.post('/link', (req, res) => {
  const { job_id, quote_id } = req.body ?? {};
  if (!job_id || !quote_id) return res.status(400).json({ error: 'job_id and quote_id required' });

  try {
    const jobA = db.prepare('SELECT id FROM jobs WHERE id=? AND company_id=?')
      .get(Number(job_id), req.companyId);
    if (!jobA) return res.status(404).json({ error: 'Job not found' });

    const quote = db.prepare('SELECT id FROM quotes WHERE id=? AND company_id=?')
      .get(Number(quote_id), req.companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // Get or create job for return quote
    let jobB = db.prepare('SELECT id FROM jobs WHERE quote_id=? AND company_id=?')
      .get(Number(quote_id), req.companyId);
    if (!jobB) {
      const r = db.prepare("INSERT INTO jobs (company_id, quote_id, status) VALUES (?, ?, 'planerad')")
        .run(req.companyId, Number(quote_id));
      jobB = { id: r.lastInsertRowid };
    }

    const dup = db.prepare(
      `SELECT id FROM job_pairs WHERE company_id=?
       AND ((job_id_a=? AND job_id_b=?) OR (job_id_a=? AND job_id_b=?))`
    ).get(req.companyId, jobA.id, jobB.id, jobB.id, jobA.id);
    if (dup) return res.status(409).json({ error: 'Already paired' });

    db.prepare('INSERT INTO job_pairs (company_id, job_id_a, job_id_b) VALUES (?, ?, ?)')
      .run(req.companyId, jobA.id, jobB.id);

    res.status(201).json({ ok: true, job_id_a: jobA.id, job_id_b: jobB.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
