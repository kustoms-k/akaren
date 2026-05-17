import { Router }        from 'express';
import db                from '../db.js';
import { buildSmsMessage, sendSms } from '../sms.js';

const router = Router();

// ─── Prepared statements ──────────────────────────────────────────────────────
const stmtByToken       = db.prepare('SELECT * FROM quotes WHERE token = ?');
const stmtAccept        = db.prepare(`UPDATE quotes SET status = 'godkänd', accepted_at = CURRENT_TIMESTAMP WHERE token = ? AND status = 'väntande'`);
const stmtDecline       = db.prepare(`UPDATE quotes SET status = 'avböjd' WHERE token = ? AND status = 'väntande'`);
const stmtCreateJob     = db.prepare(`INSERT INTO jobs (quote_id, status) VALUES (?, 'planerad')`);
const stmtDriverByTruck = db.prepare('SELECT * FROM drivers WHERE truck_id = ? AND company_id = ?');

const stmtHistory = db.prepare(`
  SELECT id, lasttyp, upphämtning, leverans, totalpris_sek, status, created_at
  FROM quotes
  WHERE upphämtning = ? AND id != ? AND company_id = ?
  ORDER BY created_at DESC
  LIMIT 10
`);

const stmtMessages = db.prepare(`
  SELECT id, sender, message, created_at
  FROM quote_messages
  WHERE quote_id = ?
  ORDER BY created_at ASC
`);

const stmtCounterOffers = db.prepare(`
  SELECT id, proposed_price_sek, note, status, dispatcher_note, revised_price_sek, created_at, responded_at
  FROM counter_offers
  WHERE quote_id = ?
  ORDER BY created_at DESC
`);

const stmtAddMessage = db.prepare(
  `INSERT INTO quote_messages (quote_id, sender, message) VALUES (?, 'customer', ?)`
);

const stmtAddCounterOffer = db.prepare(
  `INSERT INTO counter_offers (quote_id, proposed_price_sek, note) VALUES (?, ?, ?)`
);

const stmtAcceptById = db.prepare(
  `UPDATE quotes SET status = 'godkänd', accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'väntande'`
);

const stmtUpdatePrice = db.prepare(
  `UPDATE quotes SET totalpris_sek = ? WHERE id = ?`
);

const stmtCoById = db.prepare(`SELECT * FROM counter_offers WHERE id = ?`);

const stmtRespondCo = db.prepare(`
  UPDATE counter_offers
  SET status = ?, dispatcher_note = ?, revised_price_sek = ?, responded_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatId(id) {
  return `OFF-2026-${String(Number(id)).padStart(3, '0')}`;
}

function publicShape(row) {
  return {
    rawId:           row.id,
    formattedId:     formatId(row.id),
    lasttyp:         row.lasttyp,
    upphämtning:     row.upphämtning,
    leverans:        row.leverans,
    datum:           row.datum,
    fordon_id:       row.fordon_id,
    avstand_km:      row.avstand_km,
    totalpris_sek:   row.totalpris_sek,
    lez_varning:     Boolean(row.lez_varning),
    tillstånd_krävs: Boolean(row['tillstånd_krävs']),
    noteringar:      row.noteringar,
    status:          row.status ?? 'väntande',
    created_at:      row.created_at,
  };
}

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ─── GET /:token — full portal data ──────────────────────────────────────────
router.get('/:token', (req, res) => {
  try {
    const row = stmtByToken.get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Offerten hittades inte.' });

    const history      = stmtHistory.all(row.upphämtning ?? '', row.id, row.company_id ?? 1);
    const messages     = stmtMessages.all(row.id);
    const counterOffers = stmtCounterOffers.all(row.id);

    res.json({ ...publicShape(row), history, messages, counterOffers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:token/accept ──────────────────────────────────────────────────────
router.post('/:token/accept', (req, res) => {
  try {
    const row = stmtByToken.get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Offerten hittades inte.' });

    if (row.status === 'godkänd') return res.json({ status: 'godkänd', alreadyActed: true });
    if (row.status === 'avböjd')  return res.status(409).json({ error: 'Offerten har redan avböjts.' });

    stmtAccept.run(req.params.token);
    stmtCreateJob.run(row.id);

    if (row.fordon_id) {
      const driver = stmtDriverByTruck.get(row.fordon_id, row.company_id ?? 1);
      if (driver) {
        const message = buildSmsMessage(row);
        sendSms(driver.phone, message).then((r) => {
          if (r.status === 'failed') console.error('[SMS] Sändning misslyckades (public accept):', r.error);
        });
      }
    }

    res.json({ status: 'godkänd' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:token/decline ─────────────────────────────────────────────────────
router.post('/:token/decline', (req, res) => {
  try {
    const row = stmtByToken.get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Offerten hittades inte.' });

    if (row.status === 'avböjd')  return res.json({ status: 'avböjd', alreadyActed: true });
    if (row.status === 'godkänd') return res.status(409).json({ error: 'Offerten har redan godkänts.' });

    stmtDecline.run(req.params.token);
    res.json({ status: 'avböjd' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:token/messages — customer sends question ─────────────────────────
router.post('/:token/messages', (req, res) => {
  try {
    const row = stmtByToken.get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Offerten hittades inte.' });

    const { message } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const result = stmtAddMessage.run(row.id, message.trim());
    res.status(201).json({
      id:         result.lastInsertRowid,
      sender:     'customer',
      message:    message.trim(),
      created_at: nowIso(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:token/counter-offer — customer proposes price ────────────────────
router.post('/:token/counter-offer', (req, res) => {
  try {
    const row = stmtByToken.get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Offerten hittades inte.' });

    if (row.status !== 'väntande') {
      return res.status(409).json({ error: 'Kan inte lämna motbud på en stängd offert.' });
    }

    const { proposed_price_sek, note } = req.body ?? {};
    const price = Number(proposed_price_sek);
    if (!price || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'proposed_price_sek måste vara ett positivt tal' });
    }

    const result = stmtAddCounterOffer.run(row.id, price, note?.trim() ?? null);
    res.status(201).json({ id: result.lastInsertRowid, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
