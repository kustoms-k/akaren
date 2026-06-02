import { Router } from 'express';
import db          from '../db.js';
import { sendMail } from '../utils/mailer.js';
import {
  getConnectionStatus,
  createFortnoxInvoice,
  syncInvoiceStatuses,
} from '../services/fortnox.js';

const router = Router();

const stmtGetAll = db.prepare(`
  SELECT i.*, j.status AS job_status,
         q.lasttyp, q.upphämtning, q.leverans, q.avstand_km
  FROM invoices i
  LEFT JOIN jobs   j ON j.id = i.job_id
  LEFT JOIN quotes q ON q.id = j.quote_id
  WHERE i.company_id = ?
  ORDER BY i.created_at DESC
`);

const stmtGetById    = db.prepare('SELECT * FROM invoices WHERE id = ? AND company_id = ?');
const stmtGetCompany = db.prepare('SELECT * FROM companies WHERE id = ?');
const stmtGetJob     = db.prepare('SELECT * FROM jobs WHERE id = ? AND company_id = ?');
const stmtGetQuote   = db.prepare('SELECT * FROM quotes WHERE id = ? AND company_id = ?');
const stmtGetCust    = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?');

const stmtIncrCounter = db.prepare(
  'UPDATE companies SET faktura_counter = faktura_counter + 1 WHERE id = ?'
);
const stmtGetCounter = db.prepare('SELECT faktura_counter FROM companies WHERE id = ?');

const stmtInsert = db.prepare(`
  INSERT INTO invoices
    (company_id, job_id, faktura_nr, customer_name, customer_org_nr,
     customer_address, customer_email, line_items,
     subtotal, vat, total, due_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtMarkJob      = db.prepare(
  `UPDATE jobs SET status = 'fakturerad', faktura_nr = ? WHERE id = ? AND company_id = ?`
);
const stmtSetFortnoxNr = db.prepare(
  'UPDATE invoices SET fortnox_invoice_nr = ? WHERE id = ? AND company_id = ?'
);
const stmtMarkOverdue  = db.prepare(`
  UPDATE invoices SET status = 'förfallen'
  WHERE company_id = ? AND status = 'utestaende' AND due_date < date('now')
`);
const stmtSetStatus    = db.prepare(
  `UPDATE invoices SET status = ? WHERE id = ? AND company_id = ?`
);
const stmtSetReminder  = db.prepare(`
  UPDATE invoices
  SET reminder_sent_at = CURRENT_TIMESTAMP,
      reminder_count   = COALESCE(reminder_count, 0) + 1
  WHERE id = ? AND company_id = ?
`);

// ── GET / — all invoices with computed overdue status ─────────────────────────
router.get('/', (req, res) => {
  try {
    stmtMarkOverdue.run(req.companyId);
    const rows = stmtGetAll.all(req.companyId);
    const today = new Date().toISOString().slice(0, 10);
    const enriched = rows.map((inv) => {
      const daysOverdue = inv.status === 'förfallen' && inv.due_date
        ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date + 'T12:00:00').getTime()) / 86_400_000))
        : 0;
      return { ...inv, days_overdue: daysOverdue };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const row = stmtGetById.get(Number(req.params.id), req.companyId);
    if (!row) return res.status(404).json({ error: 'Faktura hittades inte' });
    res.json({ ...row, line_items: JSON.parse(row.line_items || '[]') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id/status — mark betald / reset ───────────────────────────────────
router.patch('/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  if (!['betald', 'utestaende', 'förfallen'].includes(status)) {
    return res.status(400).json({ error: 'Ogiltigt status' });
  }
  try {
    const r = stmtSetStatus.run(status, Number(req.params.id), req.companyId);
    if (r.changes === 0) return res.status(404).json({ error: 'Faktura hittades inte' });
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/reminder — send betalningspåminnelse ────────────────────────────
router.post('/:id/reminder', async (req, res) => {
  const { to, pdf_base64, filename } = req.body ?? {};
  if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 saknas' });

  try {
    const inv     = stmtGetById.get(Number(req.params.id), req.companyId);
    if (!inv) return res.status(404).json({ error: 'Faktura hittades inte' });

    const company = stmtGetCompany.get(req.companyId);
    const recipientEmail = to || inv.customer_email;

    const base64Data = pdf_base64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer  = Buffer.from(base64Data, 'base64');

    if (recipientEmail) {
      const reminderNr = (inv.reminder_count ?? 0) + 1;
      await sendMail({
        to:      recipientEmail,
        subject: `Betalningspåminnelse ${reminderNr} — ${inv.faktura_nr}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1d24">
            <div style="background:#2d3340;padding:20px 24px;border-radius:8px 8px 0 0">
              <span style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:-0.01em">${company?.name ?? 'Transportföretag'}</span>
            </div>
            <div style="border:1px solid #ececef;border-top:none;border-radius:0 0 8px 8px;padding:24px">
              <h2 style="margin:0 0 12px;font-size:16px;font-weight:700">Betalningspåminnelse</h2>
              <p style="margin:0 0 16px;color:#6b7280;line-height:1.6">
                Hej ${inv.customer_name ?? ''},<br><br>
                Vi har ännu ej noterat betalning av faktura <strong>${inv.faktura_nr}</strong>
                med förfallodatum <strong>${inv.due_date ?? '—'}</strong>.<br><br>
                Bifogat hittar ni påminnelse inkl. påminnelseavgift 60 kr.
                Vid eventuella frågor, kontakta oss gärna.
              </p>
              ${company?.bankgiro ? `<div style="background:#f4f5f7;border-radius:6px;padding:12px 16px;font-size:13px">Bankgiro: <strong>${company.bankgiro}</strong> &nbsp;·&nbsp; OCR: <strong>${inv.faktura_nr}</strong></div>` : ''}
              <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
                ${company?.name ?? ''} &nbsp;·&nbsp; ${company?.phone ?? ''} &nbsp;·&nbsp; ${company?.email ?? ''}
              </p>
            </div>
          </div>`,
        text: `Betalningspåminnelse — ${inv.faktura_nr}\n\nHej ${inv.customer_name ?? ''},\n\nVi har ej noterat betalning av faktura ${inv.faktura_nr}, förfallodatum ${inv.due_date ?? '—'}.\n\nBankgiro: ${company?.bankgiro ?? '—'}  OCR: ${inv.faktura_nr}\n\n${company?.name ?? ''}`,
        attachments: [{ filename: filename || `Paminnelse-${inv.faktura_nr}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
      });
    }

    stmtSetReminder.run(inv.id, req.companyId);
    res.json({ ok: true, sent: !!recipientEmail });
  } catch (err) {
    console.error('[invoices/reminder] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /sync-fortnox — pull payment status from Fortnox ────────────────────
router.post('/sync-fortnox', async (req, res) => {
  try {
    const { connected } = getConnectionStatus(req.companyId);
    if (!connected) return res.status(400).json({ error: 'Fortnox är inte anslutet' });
    const result = await syncInvoiceStatuses(req.companyId);
    res.json(result);
  } catch (err) {
    console.error('[invoices/sync-fortnox] failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── POST / — create invoice ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { job_id, customer_name, customer_org_nr, customer_address, customer_email, fortnox_customer_id } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id saknas' });

  try {
    const job = stmtGetJob.get(Number(job_id), req.companyId);
    if (!job) return res.status(404).json({ error: 'Uppdrag hittades inte' });

    const quote   = job.quote_id ? stmtGetQuote.get(job.quote_id, req.companyId) : null;
    const company = stmtGetCompany.get(req.companyId);

    stmtIncrCounter.run(req.companyId);
    const { faktura_counter } = stmtGetCounter.get(req.companyId);
    const year      = new Date().getFullYear();
    const faktura_nr = `FAK-${year}-${String(faktura_counter).padStart(3, '0')}`;

    const total      = Number(quote?.totalpris_sek)    || 0;
    const bränsle    = Number(quote?.bränsle_kostnad)  || 0;
    const arbKost    = Number(quote?.arbetstid_kostnad) || 0;
    const arbTim     = Number(quote?.arbetstid_timmar)  || 0;
    const avstand    = Number(quote?.avstand_km)        || 0;
    const transpKost = Math.max(0, total - bränsle - arbKost);

    const lineItems = [];
    const transpDesc = [
      `Transport — ${quote?.lasttyp || 'Frakt'}`,
      quote?.upphämtning && quote?.leverans
        ? `(${quote.upphämtning} → ${quote.leverans})`
        : null,
    ].filter(Boolean).join(' ');

    lineItems.push({
      desc:   transpDesc,
      antal:  avstand > 0 ? avstand : 1,
      unit:   avstand > 0 ? 'km' : 'st',
      apris:  avstand > 0 ? transpKost / avstand : transpKost,
      belopp: transpKost,
    });
    if (bränsle > 0) {
      lineItems.push({ desc: `Bränsletillägg${avstand > 0 ? ` (${avstand} km)` : ''}`, antal: 1, unit: 'st', apris: bränsle, belopp: bränsle });
    }
    if (arbKost > 0) {
      lineItems.push({ desc: `Arbetstid${arbTim > 0 ? ` (${arbTim} h)` : ''}`, antal: arbTim || 1, unit: arbTim > 0 ? 'h' : 'st', apris: arbTim > 0 ? arbKost / arbTim : arbKost, belopp: arbKost });
    }

    const subtotal     = total;
    const vat          = Math.round(subtotal * 0.25 * 100) / 100;
    const totalInclVat = Math.round((subtotal + vat) * 100) / 100;

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const due_date = due.toISOString().slice(0, 10);

    const insertResult = stmtInsert.run(
      req.companyId, job.id, faktura_nr,
      customer_name ?? null, customer_org_nr ?? null, customer_address ?? null, customer_email ?? null,
      JSON.stringify(lineItems), subtotal, vat, totalInclVat, due_date,
    );

    stmtMarkJob.run(faktura_nr, job.id, req.companyId);

    let fortnox_invoice_nr = null;
    try {
      const { connected } = getConnectionStatus(req.companyId);
      if (connected && quote) {
        let customerNr = null;
        if (fortnox_customer_id) {
          const cust = stmtGetCust.get(Number(fortnox_customer_id), req.companyId);
          customerNr = cust?.fortnox_customer_nr ?? null;
        }
        fortnox_invoice_nr = await createFortnoxInvoice(req.companyId, {
          job, quote: { ...quote, totalpris_sek: subtotal }, customerNr,
        });
        if (fortnox_invoice_nr) {
          stmtSetFortnoxNr.run(String(fortnox_invoice_nr), insertResult.lastInsertRowid, req.companyId);
        }
      }
    } catch (fxErr) {
      console.error('[fortnox] invoice push failed:', fxErr.message);
    }

    const invoice = stmtGetById.get(insertResult.lastInsertRowid, req.companyId);
    res.status(201).json({
      ...invoice,
      line_items: lineItems,
      fortnox_invoice_nr,
      company: {
        name:     company.name,
        org_nr:   company.org_nr,
        address:  company.address,
        phone:    company.phone,
        email:    company.email,
        bankgiro: company.bankgiro,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
