import { Router } from 'express';
import db          from '../db.js';

const router = Router();

const stmtCountByStatus = db.prepare(`
  SELECT status, COUNT(*) AS n
  FROM quotes
  WHERE company_id = ? AND strftime('%Y-%m', created_at) = ?
  GROUP BY status
`);

const stmtAvgOfferttid = db.prepare(`
  SELECT AVG((julianday(accepted_at) - julianday(created_at)) * 24 * 60) AS avg_minutes
  FROM quotes
  WHERE company_id = ? AND status = 'godkänd'
    AND accepted_at IS NOT NULL
    AND strftime('%Y-%m', created_at) = ?
`);

const stmtAvgQuote = db.prepare(`
  SELECT AVG(totalpris_sek) AS avg_sek
  FROM quotes
  WHERE company_id = ? AND strftime('%Y-%m', created_at) = ?
    AND totalpris_sek IS NOT NULL
`);

const stmtDailyVolume = db.prepare(`
  SELECT
    strftime('%Y-%m-%d', created_at) AS date,
    status,
    COUNT(*) AS n
  FROM quotes
  WHERE company_id = ? AND date(created_at) >= date('now', '-13 days')
  GROUP BY date, status
  ORDER BY date ASC
`);

router.get('/', (req, res) => {
  const month = req.query.month ?? new Date().toISOString().slice(0, 7);
  const cid   = req.companyId;

  try {
    const statusRows = stmtCountByStatus.all(cid, month);
    const byStatus   = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));

    const godkand  = byStatus['godkänd']  ?? 0;
    const avbojd   = byStatus['avböjd']   ?? 0;
    const vatande  = byStatus['väntande'] ?? 0;
    const actioned = godkand + avbojd;
    const pct      = actioned > 0 ? Math.round((godkand / actioned) * 1000) / 10 : null;

    const offerttidRow = stmtAvgOfferttid.get(cid, month);
    const avgMinutes   = offerttidRow?.avg_minutes != null ? Math.round(offerttidRow.avg_minutes) : null;

    const avgQuoteRow = stmtAvgQuote.get(cid, month);
    const avgSek      = avgQuoteRow?.avg_sek != null ? Math.round(avgQuoteRow.avg_sek) : null;

    const dailyRows = stmtDailyVolume.all(cid);

    res.json({
      month,
      acceptansgrad: { godkand, avbojd, vatande, total: godkand + avbojd + vatande, actioned, pct },
      offerttid:     { avgMinutes },
      snittoffert:   { avgSek },
      dailyVolume:   dailyRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
