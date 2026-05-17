import { Router }     from 'express';
import { randomUUID } from 'node:crypto';
import db              from '../db.js';

const router = Router();

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ── GET / — list all customer portals with activity metrics ──────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        cp.id, cp.customer_name, cp.customer_phone, cp.customer_email,
        cp.token, cp.created_at, cp.last_seen_at, cp.notes,
        (SELECT COUNT(*)
         FROM quotes q
         WHERE q.company_id = cp.company_id
           AND (q.customer_portal_id = cp.id
                OR (q.customer_phone IS NOT NULL AND q.customer_phone != '' AND q.customer_phone = cp.customer_phone))
        ) AS quote_count,
        (SELECT COALESCE(SUM(i.total), 0)
         FROM invoices i
         JOIN jobs j   ON j.id  = i.job_id
         JOIN quotes q ON q.id  = j.quote_id
         WHERE q.company_id = cp.company_id
           AND (q.customer_portal_id = cp.id
                OR (q.customer_phone IS NOT NULL AND q.customer_phone != '' AND q.customer_phone = cp.customer_phone))
           AND strftime('%Y', i.created_at) = strftime('%Y', 'now')
           AND i.status = 'betald'
        ) AS ytd_spend,
        (SELECT COUNT(*)
         FROM portal_messages pm
         WHERE pm.customer_portal_id = cp.id
           AND pm.direction = 'in'
           AND pm.read_at IS NULL
        ) AS unread_messages,
        (SELECT COUNT(*)
         FROM portal_messages pm
         WHERE pm.customer_portal_id = cp.id
        ) AS total_messages,
        (SELECT COUNT(*)
         FROM portal_inquiries pi
         WHERE pi.customer_portal_id = cp.id
           AND pi.quote_id IS NULL
        ) AS pending_inquiries
      FROM customer_portals cp
      WHERE cp.company_id = ?
      ORDER BY COALESCE(cp.last_seen_at, '') DESC, cp.created_at DESC
    `).all(req.companyId);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / — create customer portal ─────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { customer_name, customer_phone, customer_email, notes } = req.body ?? {};
    if (!customer_name?.trim()) return res.status(400).json({ error: 'customer_name required' });

    const token  = randomUUID();
    const result = db.prepare(`
      INSERT INTO customer_portals (company_id, customer_name, customer_phone, customer_email, token, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.companyId,
      customer_name.trim(),
      customer_phone?.trim() || null,
      customer_email?.trim() || null,
      token,
      notes?.trim() || null,
    );

    res.status(201).json({
      id:              result.lastInsertRowid,
      customer_name:   customer_name.trim(),
      customer_phone:  customer_phone?.trim() || null,
      customer_email:  customer_email?.trim() || null,
      token,
      notes:            notes?.trim() || null,
      created_at:       nowIso(),
      last_seen_at:     null,
      quote_count:      0,
      ytd_spend:        0,
      unread_messages:  0,
      total_messages:   0,
      pending_inquiries: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id — update customer details ─────────────────────────────────────
router.patch('/:id', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT * FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Not found' });

    const { customer_name, customer_phone, customer_email, notes } = req.body ?? {};
    db.prepare(`
      UPDATE customer_portals
      SET customer_name = ?, customer_phone = ?, customer_email = ?, notes = ?
      WHERE id = ?
    `).run(
      customer_name?.trim()  ?? portal.customer_name,
      customer_phone?.trim() ?? portal.customer_phone,
      customer_email?.trim() ?? portal.customer_email,
      notes?.trim()          ?? portal.notes,
      req.params.id,
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT id FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Not found' });

    db.prepare('DELETE FROM customer_portals WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/messages ─────────────────────────────────────────────────────────
router.get('/:id/messages', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT id FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Not found' });

    // Mark inbound messages as read when dispatcher views them
    db.prepare(`
      UPDATE portal_messages SET read_at = ?
      WHERE customer_portal_id = ? AND direction = 'in' AND read_at IS NULL
    `).run(nowIso(), req.params.id);

    const messages = db.prepare(`
      SELECT id, direction, sender_name, body, created_at, read_at
      FROM portal_messages
      WHERE customer_portal_id = ?
      ORDER BY created_at ASC
    `).all(req.params.id);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/messages — dispatcher sends message ────────────────────────────
router.post('/:id/messages', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT * FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Not found' });

    const { body, sender_name } = req.body ?? {};
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });

    const result = db.prepare(`
      INSERT INTO portal_messages (company_id, customer_portal_id, direction, sender_name, body)
      VALUES (?, ?, 'out', ?, ?)
    `).run(req.companyId, req.params.id, sender_name?.trim() || 'Kundtjänst', body.trim());

    res.status(201).json({
      id:          result.lastInsertRowid,
      direction:   'out',
      sender_name: sender_name?.trim() || 'Kundtjänst',
      body:        body.trim(),
      created_at:  nowIso(),
      read_at:     null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/activity ─────────────────────────────────────────────────────────
router.get('/:id/activity', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT id FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Not found' });

    const activity = db.prepare(`
      SELECT id, event, meta, created_at
      FROM portal_activity_log
      WHERE customer_portal_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.params.id);

    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/inquiries — pending quote requests ───────────────────────────────
router.get('/:id/inquiries', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT id FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Not found' });

    const inquiries = db.prepare(`
      SELECT id, body, created_at, quote_id
      FROM portal_inquiries
      WHERE customer_portal_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id);

    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/link-quote/:quoteId — link a quote to this portal ───────────────
router.post('/:id/link-quote/:quoteId', (req, res) => {
  try {
    const portal = db.prepare(
      'SELECT id FROM customer_portals WHERE id = ? AND company_id = ?'
    ).get(req.params.id, req.companyId);
    if (!portal) return res.status(404).json({ error: 'Portal not found' });

    const quote = db.prepare(
      'SELECT id FROM quotes WHERE id = ? AND company_id = ?'
    ).get(req.params.quoteId, req.companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    db.prepare('UPDATE quotes SET customer_portal_id = ? WHERE id = ?')
      .run(req.params.id, req.params.quoteId);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
