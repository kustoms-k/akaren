import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  const companyId = req.user.company_id;
  const { region, min_score, co2_only, watched_only } = req.query;

  let sql = `
    SELECT u.*,
           CASE WHEN uw.id IS NOT NULL THEN 1 ELSE 0 END AS watched
    FROM upphandlingar u
    LEFT JOIN upphandling_watches uw
           ON uw.upphandling_id = u.id AND uw.company_id = ?
    WHERE u.company_id = ?
      AND u.dismissed = 0
      AND (u.deadline IS NULL OR u.deadline >= date('now'))
  `;
  const params = [companyId, companyId];

  if (region) {
    sql += ` AND u.region = ?`;
    params.push(region);
  }
  if (min_score) {
    sql += ` AND u.relevans_score >= ?`;
    params.push(Number(min_score));
  }
  if (co2_only === '1') {
    sql += ` AND u.co2_fordel = 1`;
  }
  if (watched_only === '1') {
    sql += ` AND uw.id IS NOT NULL`;
  }

  sql += ` ORDER BY u.relevans_score DESC, u.deadline ASC`;

  res.json(db.prepare(sql).all(...params));
});

router.get('/stats', (req, res) => {
  const cid = req.user.company_id;

  const total = db.prepare(
    `SELECT COUNT(*) AS n FROM upphandlingar WHERE company_id = ? AND dismissed = 0`
  ).get(cid).n;

  const watched = db.prepare(
    `SELECT COUNT(*) AS n FROM upphandling_watches WHERE company_id = ?`
  ).get(cid).n;

  const expiring = db.prepare(
    `SELECT COUNT(*) AS n FROM upphandlingar
     WHERE company_id = ? AND dismissed = 0
       AND deadline IS NOT NULL
       AND deadline >= date('now')
       AND deadline <= date('now', '+7 days')`
  ).get(cid).n;

  const co2 = db.prepare(
    `SELECT COUNT(*) AS n FROM upphandlingar WHERE company_id = ? AND dismissed = 0 AND co2_fordel = 1`
  ).get(cid).n;

  const last = db.prepare(
    `SELECT MAX(hamtad_at) AS ts FROM upphandlingar WHERE company_id = ?`
  ).get(cid).ts;

  res.json({ total, watched, expiring_week: expiring, co2_advantage: co2, last_fetch: last });
});

router.post('/refresh', async (req, res) => {
  try {
    const { runTenderFetchJob } = await import('../jobs/tenderFetch.js');
    await runTenderFetchJob();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/watch', (req, res) => {
  const cid = req.user.company_id;
  const tid = Number(req.params.id);

  const existing = db.prepare(
    `SELECT id FROM upphandling_watches WHERE company_id = ? AND upphandling_id = ?`
  ).get(cid, tid);

  if (existing) {
    db.prepare(`DELETE FROM upphandling_watches WHERE id = ?`).run(existing.id);
    res.json({ watched: false });
  } else {
    db.prepare(
      `INSERT OR IGNORE INTO upphandling_watches (company_id, upphandling_id) VALUES (?, ?)`
    ).run(cid, tid);
    res.json({ watched: true });
  }
});

router.put('/:id/dismiss', (req, res) => {
  const cid = req.user.company_id;
  db.prepare(
    `UPDATE upphandlingar SET dismissed = 1 WHERE id = ? AND company_id = ?`
  ).run(Number(req.params.id), cid);
  res.json({ ok: true });
});

export default router;
