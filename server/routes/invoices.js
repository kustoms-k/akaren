import { Router } from 'express';
import db          from '../db.js';
import { getConnectionStatus, createFortnoxInvoice } from '../services/fortnox.js';

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

const stmtMarkJob       = db.prepare(
  `UPDATE jobs SET status = 'fakturerad', faktura_nr = ? WHERE id = ? AND company_id = ?`
);
const stmtSetFortnoxNr  = db.prepare(
  'UPDATE invoices SET fortnox_invoice_nr = ? WHERE id = ? AND company_id = ?'
);

router.get('/', (req, res) => {
  try {
    res.json(stmtGetAll.all(req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = stmtGetById.get(Number(req.params.id), req.companyId);
    if (!row) return res.status(404).json({ error: 'Faktura hittades inte' });
    res.json({ ...row, line_items: JSON.parse(row.line_items || '[]') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { job_id, customer_name, customer_org_nr, customer_address, customer_email, fortnox_customer_id } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id saknas' });

  try {
    const job = stmtGetJob.get(Number(job_id), req.companyId);
    if (!job) return res.status(404).json({ error: 'Uppdrag hittades inte' });

    const quote   = job.quote_id ? stmtGetQuote.get(job.quote_id, req.companyId) : null;
    const company = stmtGetCompany.get(req.companyId);

    // Auto-increment faktura counter
    stmtIncrCounter.run(req.companyId);
    const { faktura_counter } = stmtGetCounter.get(req.companyId);
    const year       = new Date().getFullYear();
    const faktura_nr = `FAK-${year}-${String(faktura_counter).padStart(3, '0')}`;

    // Build line items from quote cost breakdown
    const total   = Number(quote?.totalpris_sek)     || 0;
    const bränsle = Number(quote?.bränsle_kostnad)   || 0;
    const arbKost = Number(quote?.arbetstid_kostnad)  || 0;
    const arbTim  = Number(quote?.arbetstid_timmar)   || 0;
    const avstand = Number(quote?.avstand_km)         || 0;
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
      belopp: transpKost || total,
    });

    if (bränsle > 0) {
      lineItems.push({
        desc:   `Bränsletillägg${avstand > 0 ? ` (${avstand} km)` : ''}`,
        antal:  1,
        unit:   'st',
        apris:  bränsle,
        belopp: bränsle,
      });
    }

    if (arbKost > 0) {
      lineItems.push({
        desc:   `Arbetstid${arbTim > 0 ? ` (${arbTim} h)` : ''}`,
        antal:  arbTim || 1,
        unit:   arbTim > 0 ? 'h' : 'st',
        apris:  arbTim > 0 ? arbKost / arbTim : arbKost,
        belopp: arbKost,
      });
    }

    // VAT: totalpris_sek is excl. VAT (consistent with existing quote PDF)
    const subtotal       = total;
    const vat            = Math.round(subtotal * 0.25 * 100) / 100;
    const totalInclVat   = Math.round((subtotal + vat) * 100) / 100;

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const due_date = due.toISOString().slice(0, 10);

    const insertResult = stmtInsert.run(
      req.companyId,
      job.id,
      faktura_nr,
      customer_name    ?? null,
      customer_org_nr  ?? null,
      customer_address ?? null,
      customer_email   ?? null,
      JSON.stringify(lineItems),
      subtotal,
      vat,
      totalInclVat,
      due_date,
    );

    stmtMarkJob.run(faktura_nr, job.id, req.companyId);

    // Non-fatal Fortnox push
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
      line_items:          lineItems,
      fortnox_invoice_nr,
      company: {
        name:    company.name,
        org_nr:  company.org_nr,
        address: company.address,
        phone:   company.phone,
        email:   company.email,
        bankgiro: company.bankgiro,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
