import { Router }     from 'express';
import { randomBytes } from 'node:crypto';
import db              from '../db.js';

const stmtLinkExtraction = db.prepare(`
  UPDATE ai_extractions
  SET quote_id = ?, human_overrides = ?
  WHERE id = ? AND company_id = ?
`);

const router = Router();

// ── Prepared statements ───────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO quotes
    (company_id, token, status, inquiry_text, lasttyp, upphämtning, leverans, datum,
     fordon_id, avstand_km, totalpris_sek, lez_varning, tillstånd_krävs, noteringar,
     bränsle_kostnad, arbetstid_kostnad, arbetstid_timmar,
     confidence_score, review_status)
  VALUES (?, ?, 'väntande', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtGetById = db.prepare('SELECT * FROM quotes WHERE id = ? AND company_id = ?');

const stmtGetAll = db.prepare(`
  SELECT
    q.id, q.token, q.lasttyp, q.upphämtning, q.leverans, q.fordon_id,
    q.totalpris_sek, q.lez_varning, q.status, q.created_at,
    COALESCE(m.msg_count, 0) AS msg_count,
    COALESCE(co.co_count, 0) AS co_pending
  FROM quotes q
  LEFT JOIN (
    SELECT quote_id, COUNT(*) AS msg_count
    FROM quote_messages GROUP BY quote_id
  ) m  ON m.quote_id = q.id
  LEFT JOIN (
    SELECT quote_id, COUNT(*) AS co_count
    FROM counter_offers WHERE status = 'pending' GROUP BY quote_id
  ) co ON co.quote_id = q.id
  WHERE q.company_id = ?
  ORDER BY q.created_at DESC
`);

const stmtGetMsgs = db.prepare(`
  SELECT id, sender, message, created_at
  FROM quote_messages
  WHERE quote_id = ? AND EXISTS (SELECT 1 FROM quotes WHERE id = ? AND company_id = ?)
  ORDER BY created_at ASC
`);

const stmtAddDispMsg = db.prepare(
  `INSERT INTO quote_messages (quote_id, sender, message) VALUES (?, 'dispatcher', ?)`
);

const stmtGetCos = db.prepare(`
  SELECT id, proposed_price_sek, note, status, dispatcher_note, revised_price_sek, created_at, responded_at
  FROM counter_offers
  WHERE quote_id = ? AND EXISTS (SELECT 1 FROM quotes WHERE id = ? AND company_id = ?)
  ORDER BY created_at DESC
`);

const stmtCoById   = db.prepare('SELECT * FROM counter_offers WHERE id = ?');
const stmtRespondCo = db.prepare(`
  UPDATE counter_offers
  SET status = ?, dispatcher_note = ?, revised_price_sek = ?, responded_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const stmtUpdatePrice = db.prepare(`UPDATE quotes SET totalpris_sek = ? WHERE id = ? AND company_id = ?`);
const stmtAcceptById  = db.prepare(`UPDATE quotes SET status = 'godkänd', accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`);
const stmtCreateJob   = db.prepare(`INSERT INTO jobs (company_id, quote_id, status) VALUES (?, ?, 'planerad')`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatId(rowid) {
  return `OFF-2026-${String(Number(rowid)).padStart(3, '0')}`;
}
function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ── POST / — create quote ─────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    inquiry_text, lasttyp, upphämtning, leverans, datum,
    fordon_id, avstand_km, totalpris_sek, lez_varning,
    tillstånd_krävs, noteringar,
    bränsle_kostnad, arbetstid_kostnad, arbetstid_timmar,
    ai_extraction_id, human_overrides,
    confidence_score, review_status,
  } = req.body;

  const token = randomBytes(6).toString('hex');

  try {
    const result = stmtInsert.run(
      req.companyId,
      token,
      inquiry_text      ?? null,
      lasttyp           ?? null,
      upphämtning       ?? null,
      leverans          ?? null,
      datum             ?? null,
      fordon_id         ?? null,
      avstand_km        ?? null,
      totalpris_sek     ?? null,
      lez_varning       ? 1 : 0,
      tillstånd_krävs   ? 1 : 0,
      noteringar        ?? null,
      bränsle_kostnad   ?? null,
      arbetstid_kostnad ?? null,
      arbetstid_timmar  ?? null,
      confidence_score  ?? null,
      review_status     ?? null,
    );

    // Link the AI extraction record to this quote and record human edits
    if (ai_extraction_id) {
      try {
        stmtLinkExtraction.run(
          result.lastInsertRowid,
          human_overrides ? JSON.stringify(human_overrides) : null,
          Number(ai_extraction_id),
          req.companyId,
        );
      } catch { /* non-fatal */ }
    }

    const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      ...row,
      id:              formatId(result.lastInsertRowid),
      rawId:           result.lastInsertRowid,
      lez_varning:     Boolean(row.lez_varning),
      tillstånd_krävs: Boolean(row['tillstånd_krävs']),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — list quotes ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const rows = stmtGetAll.all(req.companyId);
    res.json(rows.map((r) => ({
      ...r,
      id:         formatId(r.id),
      rawId:      r.id,
      lez_varning: Boolean(r.lez_varning),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/messages ─────────────────────────────────────────────────────────
router.get('/:id/messages', (req, res) => {
  try {
    const id = Number(req.params.id);
    res.json(stmtGetMsgs.all(id, id, req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/messages ────────────────────────────────────────────────────────
router.post('/:id/messages', (req, res) => {
  try {
    const id = Number(req.params.id);
    const quote = stmtGetById.get(id, req.companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    const { message } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const result = stmtAddDispMsg.run(id, message.trim());
    res.status(201).json({ id: result.lastInsertRowid, sender: 'dispatcher', message: message.trim(), created_at: nowIso() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/counter-offers ───────────────────────────────────────────────────
router.get('/:id/counter-offers', (req, res) => {
  try {
    const id = Number(req.params.id);
    res.json(stmtGetCos.all(id, id, req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id/counter-offers/:offerId ───────────────────────────────────────
router.patch('/:id/counter-offers/:offerId', (req, res) => {
  try {
    const { status, dispatcher_note, revised_price_sek } = req.body ?? {};
    if (!['accepted', 'declined', 'revised'].includes(status)) {
      return res.status(400).json({ error: 'status must be accepted, declined, or revised' });
    }
    if (status === 'revised' && (!revised_price_sek || Number(revised_price_sek) <= 0)) {
      return res.status(400).json({ error: 'revised_price_sek required for revised status' });
    }

    const quoteId = Number(req.params.id);
    const quote   = stmtGetById.get(quoteId, req.companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    const co = stmtCoById.get(req.params.offerId);
    if (!co) return res.status(404).json({ error: 'Counter-offer not found' });

    stmtRespondCo.run(
      status,
      dispatcher_note ?? null,
      status === 'revised' ? Number(revised_price_sek) : null,
      req.params.offerId,
    );

    if (status === 'accepted') {
      stmtUpdatePrice.run(co.proposed_price_sek, quoteId, req.companyId);
      stmtAcceptById.run(quoteId, req.companyId);
      try { stmtCreateJob.run(req.companyId, quoteId); } catch { /* already exists */ }
    } else if (status === 'revised') {
      stmtUpdatePrice.run(Number(revised_price_sek), quoteId, req.companyId);
    }

    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
