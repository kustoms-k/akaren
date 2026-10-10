import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest, conflict, HttpError, idParam, notFound, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { currentIsoWeek, isoWeekRange } from '../lib/dates.js';
import { isValidWeek, shiftWeek, weekLabel } from '../lib/weeks.js';
import { BLOCKERS, billableRows } from '../lib/fakturaunderlag.js';
import { createUnderlagLoader } from '../services/underlag.js';
import { buildFortnoxInvoice } from '../lib/fortnoxPayload.js';
import { csvCell, fileSlug } from '../lib/massredovisning.js';
import { FortnoxApiError, FortnoxNotConfiguredError, FortnoxReconnectError } from '../services/fortnox.js';
import { fortnoxHttpError } from './fortnox.js';

const weekParam = z.string().refine(isValidWeek, 'Ogiltig vecka (ÅÅÅÅ-Vnn).');
const groupSchema = z.object({
  week: weekParam,
  customer_id: z.coerce.number().int().positive(),
  project_id: z.coerce.number().int().positive(),
}).strict();

const UNIT_TEXT = { ton: 'ton', lass: 'lass', timme: 'tim', fast: 'st' };
const oreCell = (ore) => (ore == null ? '' : (ore / 100).toFixed(2).replace('.', ','));
const qtyCell = (q, unit) => (q == null ? '' : unit === 'ton' ? q.toFixed(3).replace('.', ',') : String(q).replace('.', ','));

/**
 * Fakturaunderlag (/faktura): the week's billable work per customer + project, and the two ways out:
 * a Fortnox draft invoice, or "lås underlag" (CSV/PDF for customers outside Fortnox). Either way the
 * rows are claimed by invoice_lines (unique per lass / assignment-day / fixed job), so nothing is billed twice.
 */
export function fakturaunderlagRouter({ db, audit, fortnox, logger = console }) {
  const router = Router();

  const stmt = {
    customers: db.prepare('SELECT id, name, org_nr, address, postnr, ort, email, fortnox_customer_nr, vat_mode, price_list_id FROM customers WHERE company_id = ?'),
    batches: db.prepare(`
      SELECT b.id, b.iso_week, b.customer_id, b.project_id, b.kind, b.status, b.fortnox_document_nr, b.total_ore, b.vat_mode,
             b.error, b.created_at, u.name AS created_by_name,
             (SELECT COUNT(*) FROM invoice_lines il WHERE il.batch_id = b.id) AS line_count
      FROM invoice_batches b JOIN users u ON u.id = b.created_by_user_id
      WHERE b.company_id = ? AND b.iso_week = ? ORDER BY b.id DESC`),
    batch: db.prepare('SELECT * FROM invoice_batches WHERE id = ? AND company_id = ?'),
    insertBatch: db.prepare(`
      INSERT INTO invoice_batches (company_id, iso_week, customer_id, project_id, kind, status, external_ref, total_ore, vat_mode,
        lines_snapshot_json, created_by_user_id)
      VALUES (@company_id, @iso_week, @customer_id, @project_id, @kind, @status, @external_ref, @total_ore, @vat_mode,
        @lines_snapshot_json, @created_by_user_id)`),
    insertLine: db.prepare(`
      INSERT INTO invoice_lines (batch_id, lass_id, lass_version, assignment_id, datum, job_id, description, quantity, unit, price_ore, amount_ore)
      VALUES (@batch_id, @lass_id, @lass_version, @assignment_id, @datum, @job_id, @description, @quantity, @unit, @price_ore, @amount_ore)`),
    finish: db.prepare('UPDATE invoice_batches SET status = ?, fortnox_document_nr = ?, error = ? WHERE id = ?'),
    release: db.prepare('DELETE FROM invoice_lines WHERE batch_id = ?'),
    setFortnoxNr: db.prepare(`UPDATE customers SET fortnox_customer_nr = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND company_id = ?`),
    readyByWeek: db.prepare(`SELECT COUNT(*) FROM lass_current WHERE company_id = ? AND datum BETWEEN ? AND ?
      AND lass_id NOT IN (SELECT lass_id FROM invoice_lines WHERE lass_id IS NOT NULL)`),
  };

  const load = createUnderlagLoader(db);

  function findGroup(companyId, { week, customer_id: customerId, project_id: projectId }) {
    const underlag = load(companyId, week);
    const group = underlag.groups.find((g) => g.customer.id === customerId && g.project.id === projectId);
    if (!group) throw notFound('Det finns inget underlag för kunden och projektet den veckan.');
    return { underlag, group };
  }

  function assertBillable(group) {
    if (group.status === 'fakturerad') throw conflict('already_invoiced', 'Underlaget är redan fakturerat eller låst.');
    if (group.status === 'blockerad') {
      throw conflict('blocked', `Underlaget kan inte skickas än: ${group.blockers.map((b) => `${b.label.toLowerCase()} (${b.count})`).join(', ')}.`, { blockers: group.blockers });
    }
    return billableRows(group);
  }

  /** Create the batch and claim its rows in one transaction. A row someone else just claimed fails the whole batch. */
  function claim(req, { group, rows, week, kind, status }) {
    const externalRef = randomUUID();
    const total = rows.reduce((s, r) => s + r.amount_ore, 0);
    try {
      return db.transaction(() => {
        const id = Number(stmt.insertBatch.run({
          company_id: req.companyId, iso_week: week, customer_id: group.customer.id, project_id: group.project.id, kind, status,
          external_ref: externalRef, total_ore: total, vat_mode: group.vat_mode,
          lines_snapshot_json: JSON.stringify(rows.map(({ invoiced, blockers, ...r }) => r)), created_by_user_id: req.user.id,
        }).lastInsertRowid);
        for (const r of rows) {
          stmt.insertLine.run({
            batch_id: id, lass_id: r.lass_id ?? null, lass_version: r.lass_version ?? null,
            assignment_id: r.assignment_id ?? null, datum: r.kind === 'timmar' ? r.datum : null,
            job_id: r.kind === 'fast' || r.kind === 'lass' ? r.job_id : null,
            description: r.description, quantity: r.quantity, unit: r.unit, price_ore: r.price_ore, amount_ore: r.amount_ore,
          });
        }
        return { id, externalRef, total };
      })();
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('already_invoiced', 'Någon annan har just fakturerat en del av underlaget. Ladda om sidan.');
      throw err;
    }
  }

  // ── Read ──

  router.get('/', (req, res) => {
    const week = isValidWeek(req.query.week) ? req.query.week : currentIsoWeek();
    const underlag = load(req.companyId, week);
    const prev = shiftWeek(week, -1);
    const prevRange = isoWeekRange(prev);
    res.json({
      ...underlag,
      label: weekLabel(week),
      current_week: currentIsoWeek(),
      prev_week: prev,
      next_week: shiftWeek(week, 1),
      prev_week_open_lass: stmt.readyByWeek.pluck().get(req.companyId, prevRange.from, prevRange.to),
      batches: stmt.batches.all(req.companyId, week),
      fortnox: fortnox.getStatus(req.companyId),
      blocker_labels: BLOCKERS,
    });
  });

  // The draft exactly as it would be sent to Fortnox, for the preview dialog. Works without a connection.
  router.get('/preview', (req, res) => {
    const input = validate(groupSchema, req.query);
    const { group } = findGroup(req.companyId, input);
    const rows = group.rows.filter((r) => !r.invoiced && !r.blockers.length);
    if (!rows.length) throw conflict('nothing_to_invoice', 'Det finns inga rader att fakturera.');
    const payload = buildFortnoxInvoice({
      group: { ...group, customer: { ...group.customer, fortnox_customer_nr: group.customer.fortnox_customer_nr ?? '(ny kund)' } },
      rows, week: input.week, externalRef: '(skapas när utkastet skickas)',
    });
    res.json({ payload, totals: group.totals, vat_mode: group.vat_mode, customer: group.customer, project: group.project });
  });

  router.get('/export.csv', (req, res) => {
    const input = validate(groupSchema, req.query);
    const { group } = findGroup(req.companyId, input);
    const header = ['Datum', 'Beskrivning', 'Vågsedel', 'Regnr', 'Antal', 'Enhet', 'À-pris (kr)', 'Belopp (kr)', 'Prislista', 'Status'];
    const lines = [header, ...group.rows.map((r) => [
      r.datum, r.description, r.vagsedel_nr ?? '', r.regnr ?? '', qtyCell(r.quantity, r.unit), UNIT_TEXT[r.unit], oreCell(r.price_ore),
      oreCell(r.amount_ore), r.price_source ?? '',
      r.invoiced ? (r.invoiced.kind === 'fortnox' ? `Fortnox ${r.invoiced.fortnox_document_nr ?? ''}`.trim() : 'Låst') : r.blockers.map((b) => BLOCKERS[b]).join(', ') || 'Klar',
    ])];
    const t = group.totals;
    lines.push([], ['', 'Summa exkl. moms', '', '', '', '', '', oreCell(t.net_ore + t.invoiced_net_ore)]);
    const csv = `﻿${lines.map((l) => l.map(csvCell).join(';')).join('\r\n')}\r\n`;
    audit({ ...officeActor(req), entity: 'fakturaunderlag', entityId: `${input.week}:${group.key}`, action: 'export_csv' });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="fakturaunderlag-${input.week}-${fileSlug(group.customer.name)}-${fileSlug(group.project.name)}.csv"`);
    res.send(csv);
  });

  // ── Out ──

  // "Lås underlag": for customers invoiced outside Fortnox. Claims the rows; the office sends the PDF/CSV.
  router.post('/lock', (req, res) => {
    const input = validate(groupSchema, req.body);
    const { group } = findGroup(req.companyId, input);
    const rows = assertBillable(group);
    const batch = claim(req, { group, rows, week: input.week, kind: 'manuell', status: 'skapad' });
    audit({ ...officeActor(req), entity: 'invoice_batch', entityId: batch.id, action: 'lock', after: { week: input.week, customer_id: group.customer.id, project_id: group.project.id, rows: rows.length, total_ore: batch.total } });
    res.status(201).json({ id: batch.id, kind: 'manuell', status: 'skapad', total_ore: batch.total, rows: rows.length });
  });

  // A Fortnox draft (unbooked) invoice for one customer + project and week.
  router.post('/fortnox', asyncHandler(async (req, res) => {
    const input = validate(groupSchema, req.body);
    const { group } = findGroup(req.companyId, input);
    const rows = assertBillable(group);
    const status = fortnox.getStatus(req.companyId);
    if (!status.configured) throw fortnoxHttpError(new FortnoxNotConfiguredError());
    if (status.status !== 'connected') throw fortnoxHttpError(new FortnoxReconnectError(status.status));
    if (!group.customer.fortnox_customer_nr) {
      throw conflict('customer_not_in_fortnox', `${group.customer.name} finns inte i Fortnox än. Synka kunderna eller skapa kunden i Fortnox först.`);
    }

    const batch = claim(req, { group, rows, week: input.week, kind: 'fortnox', status: 'pending' });
    const payload = buildFortnoxInvoice({ group, rows, week: input.week, externalRef: batch.externalRef });
    let invoice = null;
    let failure = null;
    try {
      invoice = await fortnox.createInvoice(req.companyId, payload);
    } catch (err) {
      failure = err;
      // No clear answer (timeout, 5xx): the draft may exist. Look it up by our reference before giving up.
      if (!(err instanceof FortnoxReconnectError) && !(err instanceof FortnoxApiError && err.status >= 400 && err.status < 500)) {
        try { invoice = await fortnox.findInvoiceByExternalRef(req.companyId, batch.externalRef); } catch { /* keep the first error */ }
      }
    }

    if (invoice?.DocumentNumber) {
      stmt.finish.run('skapad', String(invoice.DocumentNumber), null, batch.id);
      audit({ ...officeActor(req), entity: 'invoice_batch', entityId: batch.id, action: 'fortnox_draft', after: { week: input.week, document_nr: String(invoice.DocumentNumber), rows: rows.length, total_ore: batch.total } });
      return res.status(201).json({ id: batch.id, kind: 'fortnox', status: 'skapad', fortnox_document_nr: String(invoice.DocumentNumber), total_ore: batch.total, rows: rows.length });
    }

    // Failed: keep the batch as a record and release the rows so they can be sent again.
    const detail = failure ? `${failure.code ?? 'error'}${failure.status ? ` ${failure.status}` : ''}` : 'no_document_number';
    db.transaction(() => { stmt.finish.run('misslyckad', null, detail, batch.id); stmt.release.run(batch.id); })();
    logger.error('[fakturaunderlag] Fortnox draft failed:', detail, failure?.body ? JSON.stringify(failure.body).slice(0, 500) : '');
    audit({ ...officeActor(req), entity: 'invoice_batch', entityId: batch.id, action: 'fortnox_failed', after: { error: detail } });
    if (failure instanceof FortnoxApiError && failure.status >= 400 && failure.status < 500) {
      const msg = failure.body?.ErrorInformation?.message ?? failure.body?.ErrorInformation?.Message;
      throw new HttpError(502, 'fortnox_rejected', `Fortnox tog inte emot utkastet${msg ? `: ${String(msg).slice(0, 200)}` : '.'} Inget skapades; raderna är fria att skicka igen.`);
    }
    throw failure ? fortnoxHttpError(failure) : new HttpError(502, 'fortnox_error', 'Fortnox svarade inte med något fakturanummer. Försök igen.');
  }));

  // Undo a lock or a draft: the rows become billable again. A Fortnox draft must be deleted in Fortnox too.
  router.post('/batches/:id/void', (req, res) => {
    const batch = stmt.batch.get(idParam(req.params.id), req.companyId);
    if (!batch) throw notFound('Underlaget finns inte.');
    if (batch.status === 'makulerad') throw conflict('already_void', 'Underlaget är redan makulerat.');
    db.transaction(() => { stmt.finish.run('makulerad', batch.fortnox_document_nr, batch.error, batch.id); stmt.release.run(batch.id); })();
    audit({ ...officeActor(req), entity: 'invoice_batch', entityId: batch.id, action: 'void', before: { status: batch.status, kind: batch.kind, fortnox_document_nr: batch.fortnox_document_nr } });
    res.json({ ok: true, fortnox_document_nr: batch.fortnox_document_nr });
  });

  // Customer mapping: create the customer in Fortnox when it isn't there.
  router.post('/customers/:id/fortnox', asyncHandler(async (req, res) => {
    const customer = stmt.customers.all(req.companyId).find((c) => c.id === idParam(req.params.id));
    if (!customer) throw notFound('Kunden finns inte.');
    if (customer.fortnox_customer_nr) throw conflict('already_in_fortnox', `Kunden har redan kundnummer ${customer.fortnox_customer_nr} i Fortnox.`);
    if (!customer.org_nr) throw badRequest('Lägg in kundens organisationsnummer först.');
    let nr;
    try { nr = await fortnox.createCustomer(req.companyId, customer); } catch (err) { throw fortnoxHttpError(err); }
    if (!nr) throw new HttpError(502, 'fortnox_error', 'Fortnox svarade inte med något kundnummer.');
    stmt.setFortnoxNr.run(nr, customer.id, req.companyId);
    audit({ ...officeActor(req), entity: 'customer', entityId: customer.id, action: 'fortnox_create', after: { fortnox_customer_nr: nr } });
    res.status(201).json({ fortnox_customer_nr: nr });
  }));

  return router;
}
