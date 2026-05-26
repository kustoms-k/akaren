import { Router }     from 'express';
import { randomBytes } from 'node:crypto';
import db              from '../db.js';
import { sendMail }    from '../utils/mailer.js';
import { computeInsightsForCompany } from '../jobs/pricingInsights.js';

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
const stmtSetStatus   = db.prepare(`UPDATE quotes SET status = ? WHERE id = ? AND company_id = ?`);
const stmtSetEmail    = db.prepare(`UPDATE quotes SET customer_email = ?, customer_name = ?, status = 'skickad' WHERE id = ? AND company_id = ?`);
const stmtGetCompany  = db.prepare(`SELECT * FROM companies WHERE id = ?`);

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

// ── PATCH /:id/status — update quote status manually ─────────────────────────
router.patch('/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  const allowed = ['väntande', 'skickad', 'godkänd', 'avböjd'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  try {
    const id     = Number(req.params.id);
    const result = stmtSetStatus.run(status, id, req.companyId);
    if (result.changes === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json({ ok: true, status });
    // Recompute pricing insights so win-rate data stays fresh after each outcome
    if (status === 'godkänd' || status === 'avböjd') {
      try { computeInsightsForCompany(req.companyId); } catch { /* non-fatal */ }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/email — send quote PDF to customer ──────────────────────────────
router.post('/:id/email', async (req, res) => {
  const { to, cc_owner, customer_name, pdf_base64, filename } = req.body ?? {};
  if (!to || !pdf_base64) {
    return res.status(400).json({ error: 'to and pdf_base64 are required' });
  }

  const id = Number(req.params.id);
  try {
    const quote   = stmtGetById.get(id, req.companyId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    const company = stmtGetCompany.get(req.companyId);

    // Decode base64 PDF (strip data URI prefix if present)
    const base64Data = pdf_base64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer  = Buffer.from(base64Data, 'base64');

    const route = [quote.upphämtning, quote.leverans].filter(Boolean).join(' → ');
    const priceStr = quote.totalpris_sek
      ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(quote.totalpris_sek) + ' kr'
      : null;

    const ccList = cc_owner && company?.email ? company.email : undefined;

    const result = await sendMail({
      to,
      cc:      ccList,
      subject: `Offert från ${company?.name ?? 'Åkaren'} — ${route || quote.lasttyp || 'Transport'}`,
      attachments: [{ filename: filename || 'offert.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
      text: [
        `Hej${customer_name ? ' ' + customer_name : ''},`,
        '',
        `Tack för ert intresse. Bifogat finner ni offert för: ${route || quote.lasttyp || 'transport'}.`,
        priceStr ? `Pris (exkl. moms): ${priceStr}` : null,
        '',
        'Offerten är giltig i 14 dagar. Hör av er om ni har frågor.',
        '',
        `Med vänliga hälsningar,`,
        company?.name ?? '',
        company?.phone ?? '',
        company?.email ?? '',
      ].filter((l) => l !== null).join('\n'),
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#151210">
          <div style="background:#0d0d0f;padding:22px 28px;border-radius:10px 10px 0 0">
            <span style="font-size:17px;font-weight:700;color:#c9921e;letter-spacing:-0.01em">${company?.name ?? 'Åkaren'}</span>
          </div>
          <div style="border:1px solid #e6e2da;border-top:none;border-radius:0 0 10px 10px;padding:28px">
            <p style="margin:0 0 16px;color:#6a6050;line-height:1.7">
              Hej${customer_name ? ' <strong>' + customer_name + '</strong>' : ''},<br>
              Tack för ert intresse. Bifogat finner ni offert för:
              <strong style="color:#151210"> ${route || quote.lasttyp || 'transport'}</strong>.
            </p>
            ${priceStr ? `<div style="background:#f4f0e7;border-radius:8px;padding:12px 18px;margin-bottom:16px;font-size:14px">Pris exkl. moms: <strong style="color:#151210">${priceStr}</strong></div>` : ''}
            <p style="margin:0 0 16px;color:#6a6050;line-height:1.7">Offerten är giltig i 14 dagar. Hör av er om ni har frågor eller om ni vill justera något.</p>
            <p style="margin:24px 0 0;font-size:12px;color:#9a9082">
              Med vänliga hälsningar,<br>
              <strong style="color:#151210">${company?.name ?? ''}</strong>
              ${company?.phone ? '<br>' + company.phone : ''}
              ${company?.email ? '<br>' + company.email : ''}
            </p>
          </div>
        </div>`,
    });

    // Save customer email + mark as skickad
    stmtSetEmail.run(to, customer_name ?? null, id, req.companyId);

    res.json({ ok: true, simulated: Boolean(result?.simulated) });
  } catch (err) {
    console.error('[quotes/email] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
