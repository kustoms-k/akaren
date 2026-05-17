import { Router } from 'express';
import db          from '../db.js';

const router = Router();

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

const stmtGetPortal = db.prepare(`
  SELECT cp.*, c.name AS company_name, c.email AS company_email,
         c.phone AS company_phone, c.address AS company_address,
         c.org_nr AS company_org_nr
  FROM customer_portals cp
  JOIN companies c ON c.id = cp.company_id
  WHERE cp.token = ?
`);

const stmtUpdateLastSeen = db.prepare(
  `UPDATE customer_portals SET last_seen_at = ? WHERE token = ?`
);

const stmtGetQuotes = db.prepare(`
  SELECT
    q.id, q.token, q.lasttyp, q.upphämtning, q.leverans, q.datum,
    q.totalpris_sek, q.status, q.created_at, q.noteringar,
    q.lez_varning, q.tillstånd_krävs,
    j.id        AS job_id,
    j.status    AS job_status,
    i.id        AS invoice_id,
    i.faktura_nr,
    i.total     AS invoice_total,
    i.status    AS invoice_status
  FROM quotes q
  LEFT JOIN jobs j     ON j.quote_id = q.id AND j.company_id = q.company_id
  LEFT JOIN invoices i ON i.job_id   = j.id
  WHERE q.company_id = ?
    AND (
      q.customer_portal_id = ?
      OR (q.customer_phone IS NOT NULL AND q.customer_phone != '' AND q.customer_phone = ?)
    )
  ORDER BY q.created_at DESC
`);

const stmtYtdSpend = db.prepare(`
  SELECT COALESCE(SUM(i.total), 0) AS ytd
  FROM invoices i
  JOIN jobs j   ON j.id  = i.job_id
  JOIN quotes q ON q.id  = j.quote_id
  WHERE q.company_id = ?
    AND (
      q.customer_portal_id = ?
      OR (q.customer_phone IS NOT NULL AND q.customer_phone != '' AND q.customer_phone = ?)
    )
    AND strftime('%Y', i.created_at) = strftime('%Y', 'now')
    AND i.status = 'betald'
`);

const stmtGetMessages = db.prepare(`
  SELECT id, direction, sender_name, body, created_at, read_at
  FROM portal_messages
  WHERE customer_portal_id = ?
  ORDER BY created_at ASC
`);

const stmtGetInquiries = db.prepare(`
  SELECT id, body, created_at, quote_id
  FROM portal_inquiries
  WHERE customer_portal_id = ?
  ORDER BY created_at DESC
  LIMIT 10
`);

const stmtMarkOutRead = db.prepare(`
  UPDATE portal_messages
  SET read_at = ?
  WHERE customer_portal_id = ? AND direction = 'out' AND read_at IS NULL
`);

const stmtLogActivity = db.prepare(`
  INSERT INTO portal_activity_log (customer_portal_id, company_id, event, meta)
  VALUES (?, ?, ?, ?)
`);

const stmtAddMessage = db.prepare(`
  INSERT INTO portal_messages (company_id, customer_portal_id, direction, sender_name, body)
  VALUES (?, ?, 'in', ?, ?)
`);

const stmtAddInquiry = db.prepare(`
  INSERT INTO portal_inquiries (company_id, customer_portal_id, body)
  VALUES (?, ?, ?)
`);

// ── GET /api/portal/:token ────────────────────────────────────────────────────
router.get('/:token', (req, res) => {
  try {
    const portal = stmtGetPortal.get(req.params.token);
    if (!portal) return res.status(404).json({ error: 'Portal hittades inte.' });

    const now   = nowIso();
    const phone = portal.customer_phone ?? '';

    stmtUpdateLastSeen.run(now, req.params.token);
    stmtMarkOutRead.run(now, portal.id);
    stmtLogActivity.run(portal.id, portal.company_id, 'view', null);

    const quotes   = stmtGetQuotes.all(portal.company_id, portal.id, phone);
    const { ytd }  = stmtYtdSpend.get(portal.company_id, portal.id, phone);
    const messages = stmtGetMessages.all(portal.id);
    const inquiries = stmtGetInquiries.all(portal.id);

    const totalSpend = quotes.reduce(
      (sum, q) => sum + (q.status === 'godkänd' || q.status === 'avslutad' ? (Number(q.totalpris_sek) || 0) : 0),
      0,
    );

    res.json({
      portal: {
        id:               portal.id,
        customer_name:    portal.customer_name,
        customer_phone:   portal.customer_phone,
        customer_email:   portal.customer_email,
        company_name:     portal.company_name,
        company_email:    portal.company_email,
        company_phone:    portal.company_phone,
        company_address:  portal.company_address,
        company_org_nr:   portal.company_org_nr,
        last_seen_at:     now,
      },
      quotes,
      ytd_spend:    ytd,
      total_spend:  totalSpend,
      messages,
      inquiries,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/portal/:token/messages ─────────────────────────────────────────
router.post('/:token/messages', (req, res) => {
  try {
    const portal = stmtGetPortal.get(req.params.token);
    if (!portal) return res.status(404).json({ error: 'Portal hittades inte.' });

    const { body } = req.body ?? {};
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });

    const result = stmtAddMessage.run(portal.company_id, portal.id, portal.customer_name, body.trim());
    stmtLogActivity.run(portal.id, portal.company_id, 'message_sent', null);

    res.status(201).json({
      id:          result.lastInsertRowid,
      direction:   'in',
      sender_name: portal.customer_name,
      body:        body.trim(),
      created_at:  nowIso(),
      read_at:     null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/portal/:token/inquiries — request new quote ────────────────────
router.post('/:token/inquiries', (req, res) => {
  try {
    const portal = stmtGetPortal.get(req.params.token);
    if (!portal) return res.status(404).json({ error: 'Portal hittades inte.' });

    const { body } = req.body ?? {};
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });

    const result = stmtAddInquiry.run(portal.company_id, portal.id, body.trim());
    stmtLogActivity.run(portal.id, portal.company_id, 'inquiry_sent', null);

    res.status(201).json({
      id:         result.lastInsertRowid,
      body:       body.trim(),
      created_at: nowIso(),
      quote_id:   null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
