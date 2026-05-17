import { Router }        from 'express';
import db                from '../db.js';
import { buildSmsMessage, sendSms } from '../sms.js';
import { getConnectionStatus, createFortnoxInvoice } from '../services/fortnox.js';

const router = Router();

const stmtGetAll = db.prepare(`
  SELECT j.id, j.quote_id, j.status, j.faktura_nr, j.fortnox_invoice_nr, j.customer_id, j.created_at,
         q.lasttyp, q.upphämtning, q.leverans, q.totalpris_sek, q.avstand_km, q.datum,
         i.id           AS invoice_id,
         i.faktura_nr   AS invoice_faktura_nr,
         i.total        AS invoice_total,
         i.subtotal     AS invoice_subtotal,
         i.vat          AS invoice_vat,
         i.customer_name, i.customer_org_nr, i.customer_address, i.customer_email,
         i.due_date, i.status AS invoice_status, i.line_items,
         i.fortnox_invoice_nr AS invoice_fortnox_nr
  FROM jobs j
  LEFT JOIN quotes q   ON q.id = j.quote_id      AND q.company_id  = j.company_id
  LEFT JOIN invoices i ON i.job_id = j.id         AND i.company_id  = j.company_id
  WHERE j.company_id = ?
  ORDER BY j.created_at DESC
`);

const stmtInsert        = db.prepare(`INSERT INTO jobs (company_id, quote_id, status) VALUES (?, ?, 'planerad')`);
const stmtGetById       = db.prepare('SELECT * FROM jobs WHERE id = ? AND company_id = ?');
const stmtQuoteById     = db.prepare('SELECT * FROM quotes WHERE id = ? AND company_id = ?');
const stmtDriverByTruck = db.prepare('SELECT * FROM drivers WHERE truck_id = ? AND company_id = ?');
const stmtMarkFaktura      = db.prepare(`UPDATE jobs SET status = 'fakturerad', faktura_nr = ?, customer_id = ? WHERE id = ? AND company_id = ?`);
const stmtSetFortnoxNr     = db.prepare(`UPDATE jobs SET fortnox_invoice_nr = ? WHERE id = ? AND company_id = ?`);
const stmtCustomerByNr     = db.prepare(`SELECT fortnox_customer_nr FROM customers WHERE id = ? AND company_id = ?`);

router.get('/', (req, res) => {
  try {
    res.json(stmtGetAll.all(req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { quote_id } = req.body;
  if (quote_id == null) return res.status(400).json({ error: 'quote_id saknas' });

  try {
    const insertResult = stmtInsert.run(req.companyId, quote_id);
    const job          = stmtGetById.get(insertResult.lastInsertRowid, req.companyId);

    const quote  = stmtQuoteById.get(quote_id, req.companyId);
    const driver = quote?.fordon_id ? stmtDriverByTruck.get(quote.fordon_id, req.companyId) : null;

    let sms_status      = 'simulated';
    let sms_driver_name = driver?.name ?? null;
    let sms_error       = null;

    if (driver && quote) {
      const smsResult = await sendSms(driver.phone, buildSmsMessage(quote));
      sms_status = smsResult.status;
      sms_error  = smsResult.error ?? null;
    }

    res.status(201).json({ ...job, sms_status, sms_driver_name, sms_error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/faktura', async (req, res) => {
  const { faktura_nr, customer_id } = req.body;
  if (!faktura_nr) return res.status(400).json({ error: 'faktura_nr saknas' });

  const jobId = Number(req.params.id);

  try {
    const result = stmtMarkFaktura.run(faktura_nr, customer_id ?? null, jobId, req.companyId);
    if (result.changes === 0) return res.status(404).json({ error: 'Uppdrag hittades inte.' });

    let fortnox_invoice_nr = null;

    // Push to Fortnox if connected (non-fatal)
    const { connected } = getConnectionStatus(req.companyId);
    if (connected) {
      try {
        const job   = stmtGetById.get(jobId, req.companyId);
        const quote = job?.quote_id ? stmtQuoteById.get(job.quote_id, req.companyId) : null;

        let customerNr = null;
        if (customer_id) {
          const cust = stmtCustomerByNr.get(customer_id, req.companyId);
          customerNr = cust?.fortnox_customer_nr ?? null;
        }

        if (quote) {
          fortnox_invoice_nr = await createFortnoxInvoice(req.companyId, { job, quote, customerNr });
          if (fortnox_invoice_nr) {
            stmtSetFortnoxNr.run(String(fortnox_invoice_nr), jobId, req.companyId);
          }
        }
      } catch (fxErr) {
        console.error('[fortnox] invoice push failed:', fxErr.message);
      }
    }

    res.json({ ok: true, faktura_nr, fortnox_invoice_nr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
