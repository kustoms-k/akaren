import { Router } from 'express';
import { z } from 'zod';
import { badRequest, conflict, idParam, notFound, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { optionalText, orgNr, requiredText, idRef } from '../lib/schemas.js';
import { addDays, stockholmDate } from '../lib/dates.js';
import { submittedConfidence } from '../lib/lassReview.js';
import { csvCell, fileSlug, kgToTonCell } from '../lib/massredovisning.js';
import { FIELDS, MAX_ROWS, WeighListError, parseWeighList, previewWeighList, regnrKey } from '../lib/weighList.js';
import { FIXABLE, estimateValue, facilityMatches, reconcile, suggestAssignment } from '../lib/reconcile.js';
import { lassFieldsSchema } from './driver.js';

// 5000 rows of a wide export fit comfortably; the route's own JSON parser allows this (see app.js).
const MAX_TEXT = 2_500_000;

const mappingSchema = z.object({
  columns: z.partialRecord(z.enum(FIELDS), z.number().int().min(0).max(200)),
  unit: z.enum(['kg', 'ton']),
}).strict();

const previewSchema = z.object({
  text: z.string({ error: 'Klistra in listan eller välj en fil.' }).min(1, 'Klistra in listan eller välj en fil.').max(MAX_TEXT, 'Listan är för stor.'),
  mapping: mappingSchema.optional(),
}).strict();

const createSchema = z.object({
  text: previewSchema.shape.text,
  mapping: mappingSchema,
  facility_name: requiredText(120),
  facility_orgnr: orgNr,
  source_name: optionalText(200),
}).strict();

const createLassSchema = z.object({
  job_id: idRef,
  assignment_id: idRef.nullable().optional(),
  material: optionalText(120),
  avfallskod: lassFieldsSchema.shape.avfallskod,
  farligt_avfall: z.boolean().optional(),
}).strict();

const fixSchema = z.object({
  fields: z.array(z.enum(FIXABLE)).min(1, 'Välj vad som ska rättas.'),
}).strict();

const ignoreSchema = z.object({ reason: requiredText(200) }).strict();

const parseJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const STATUS_TEXT = { matchad: 'Matchad', avvikelse: 'Avvikelse', saknas: 'Saknas i Åkaren', ignorerad: 'Ignorerad' };
const FIELD_TEXT = { netto_kg: 'vikt', vagsedel_nr: 'vågsedelnr', datum: 'datum', regnr: 'regnr' };

/**
 * Avstämning (/api/avstamning): the office imports a receiving facility's weighing list and sees, per weighing,
 * whether a lass is logged for it. Weighings without a lass are loads that would never be invoiced; the office
 * creates the lass from the row (on a job it picks) or ignores the row with a reason. Matched lass whose values
 * differ from the scale can be corrected from the list, as a new lass version.
 */
export function avstamningRouter({ db, audit, lass: lassService }) {
  const router = Router();

  const stmt = {
    lists: db.prepare(`
      SELECT w.*, u.name AS created_by_name, (SELECT COUNT(*) FROM weigh_list_rows r WHERE r.weigh_list_id = w.id) AS row_count
      FROM weigh_lists w JOIN users u ON u.id = w.created_by_user_id
      WHERE w.company_id = ? ORDER BY w.period_to DESC, w.id DESC LIMIT 100`),
    recentLists: db.prepare('SELECT * FROM weigh_lists WHERE company_id = ? AND period_to >= ? ORDER BY period_to DESC, id DESC'),
    list: db.prepare(`
      SELECT w.*, u.name AS created_by_name FROM weigh_lists w JOIN users u ON u.id = w.created_by_user_id
      WHERE w.id = ? AND w.company_id = ?`),
    rows: db.prepare('SELECT * FROM weigh_list_rows WHERE weigh_list_id = ? ORDER BY datum, tid, line_no'),
    row: db.prepare('SELECT * FROM weigh_list_rows WHERE id = ? AND weigh_list_id = ? AND company_id = ?'),
    candidates: db.prepare(`
      SELECT lc.lass_id, lc.version, lc.job_id, lc.assignment_id, lc.datum, lc.tid, lc.vagsedel_nr, lc.vehicle_regnr,
             lc.netto_kg, lc.material, lc.till_namn, lc.till_orgnr, lc.review_status, lc.customer_id, lc.project_id,
             c.name AS customer_name, p.name AS project_name,
             EXISTS (SELECT 1 FROM invoice_lines il WHERE il.lass_id = lc.lass_id) AS invoiced
      FROM lass_current lc
      JOIN customers c ON c.id = lc.customer_id
      JOIN projects p ON p.id = lc.project_id
      WHERE lc.company_id = @cid
        AND (lc.datum BETWEEN @from AND @to
          OR lc.lass_id IN (SELECT resolved_lass_id FROM weigh_list_rows WHERE weigh_list_id = @list AND resolved_lass_id IS NOT NULL))`),
    assignments: db.prepare(`
      SELECT a.id, a.job_id, a.datum, v.regnr, d.name AS driver_name,
             j.uppdragstyp, j.material AS job_material, j.status AS job_status, j.customer_id, j.project_id,
             c.name AS customer_name, p.name AS project_name
      FROM job_assignments a
      JOIN vehicles v ON v.id = a.vehicle_id
      JOIN drivers d ON d.id = a.driver_id
      JOIN jobs j ON j.id = a.job_id
      JOIN customers c ON c.id = j.customer_id
      JOIN projects p ON p.id = j.project_id
      WHERE a.company_id = ? AND a.datum BETWEEN ? AND ? AND a.cancelled_at IS NULL AND j.status != 'avbruten'`),
    jobs: db.prepare('SELECT id, customer_id, project_id, uppdragstyp, material, status, fran_text FROM jobs WHERE company_id = ?'),
    job: db.prepare('SELECT id, customer_id, project_id, uppdragstyp, material, status, fran_text FROM jobs WHERE id = ? AND company_id = ?'),
    assignment: db.prepare(`
      SELECT a.id, a.driver_id, a.datum, v.regnr FROM job_assignments a JOIN vehicles v ON v.id = a.vehicle_id
      WHERE a.id = ? AND a.job_id = ? AND a.company_id = ? AND a.cancelled_at IS NULL`),
    customers: db.prepare('SELECT id, name, price_list_id FROM customers WHERE company_id = ?'),
    projects: db.prepare('SELECT id, customer_id, name, price_list_id FROM projects WHERE company_id = ?'),
    priceLists: db.prepare('SELECT id, name, is_default FROM price_lists WHERE company_id = ?'),
    priceItems: db.prepare('SELECT i.* FROM price_list_items i JOIN price_lists l ON l.id = i.price_list_id WHERE l.company_id = ?'),
    // The waste code and hazard flag of the job's latest lass with the same material: a suggestion the office confirms.
    lastOnJob: db.prepare(`
      SELECT avfallskod, farligt_avfall FROM lass_current
      WHERE company_id = ? AND job_id = ? AND (? IS NULL OR lower(material) = lower(?)) AND avfallskod IS NOT NULL
      ORDER BY datum DESC, tid DESC, lass_id DESC LIMIT 1`),
    facilities: db.prepare(`
      SELECT till_namn AS name, MAX(till_orgnr) AS orgnr, COUNT(*) AS lass_count, MAX(datum) AS last_datum
      FROM lass_current WHERE company_id = ? AND till_namn IS NOT NULL AND trim(till_namn) != ''
      GROUP BY lower(trim(till_namn)) ORDER BY lass_count DESC LIMIT 40`),
    insertList: db.prepare(`
      INSERT INTO weigh_lists (company_id, facility_name, facility_orgnr, period_from, period_to, source_name, mapping_json, skipped_json, created_by_user_id)
      VALUES (@company_id, @facility_name, @facility_orgnr, @period_from, @period_to, @source_name, @mapping_json, @skipped_json, @created_by_user_id)`),
    insertRow: db.prepare(`
      INSERT INTO weigh_list_rows (weigh_list_id, company_id, line_no, datum, tid, vagsedel_nr, regnr, netto_kg, material, referens)
      VALUES (@weigh_list_id, @company_id, @line, @datum, @tid, @vagsedel_nr, @regnr, @netto_kg, @material, @referens)`),
    resolveCreated: db.prepare(`
      UPDATE weigh_list_rows SET resolution = 'lass_skapad', resolved_lass_id = ?, resolution_note = NULL,
        resolved_by_user_id = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND resolution IS NOT 'lass_skapad'`),
    resolveIgnored: db.prepare(`
      UPDATE weigh_list_rows SET resolution = 'ignorerad', resolution_note = ?, resolved_by_user_id = ?,
        resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND resolution IS NULL`),
    unignore: db.prepare(`
      UPDATE weigh_list_rows SET resolution = NULL, resolution_note = NULL, resolved_by_user_id = NULL, resolved_at = NULL
      WHERE id = ? AND resolution = 'ignorerad'`),
    createdCount: db.prepare('SELECT COUNT(*) FROM weigh_list_rows WHERE weigh_list_id = ? AND resolved_lass_id IS NOT NULL'),
    deleteList: db.prepare('DELETE FROM weigh_lists WHERE id = ? AND company_id = ?'),
  };

  /** Price lists with their items, customers, projects and jobs by id: what estimates need. */
  function pricingContext(companyId) {
    const lists = stmt.priceLists.all(companyId).map((l) => ({ ...l, items: [] }));
    const byList = new Map(lists.map((l) => [l.id, l]));
    for (const it of stmt.priceItems.all(companyId)) byList.get(it.price_list_id)?.items.push(it);
    return {
      priceLists: lists,
      customers: new Map(stmt.customers.all(companyId).map((c) => [c.id, c])),
      projects: new Map(stmt.projects.all(companyId).map((p) => [p.id, p])),
      jobs: new Map(stmt.jobs.all(companyId).map((j) => [j.id, j])),
    };
  }

  const estimate = (ctx, job, { material, nettoKg }) => estimateValue({
    job, customer: ctx.customers.get(job.customer_id), project: ctx.projects.get(job.project_id),
    priceLists: ctx.priceLists, material, nettoKg,
  });

  function loadList(req) {
    const list = stmt.list.get(idParam(req.params.id), req.companyId);
    if (!list) throw notFound('Våglistan finns inte.');
    return list;
  }

  /** The whole reconciliation of one list, with suggestions and estimated values. */
  function build(companyId, list, ctx = pricingContext(companyId)) {
    const facility = { name: list.facility_name, orgnr: list.facility_orgnr };
    const period = { from: list.period_from, to: list.period_to };
    const rows = stmt.rows.all(list.id);
    const candidates = stmt.candidates.all({
      cid: companyId, from: addDays(list.period_from, -3), to: addDays(list.period_to, 3), list: list.id,
    }).map((l) => ({ ...l, invoiced: Boolean(l.invoiced) }));
    const result = reconcile({ rows, lass: candidates, facility, period });

    // The trucks' assignments in the period, with how many of each assignment's lass went to this facility.
    const toFacility = new Map();
    for (const l of candidates) {
      if (l.assignment_id && facilityMatches(l, facility)) toFacility.set(l.assignment_id, (toFacility.get(l.assignment_id) ?? 0) + 1);
    }
    const assignmentsByTruckDay = new Map();
    for (const a of stmt.assignments.all(companyId, list.period_from, list.period_to)) {
      const k = `${regnrKey(a.regnr)}|${a.datum}`;
      if (!assignmentsByTruckDay.has(k)) assignmentsByTruckDay.set(k, []);
      assignmentsByTruckDay.get(k).push({ ...a, lass_to_facility: toFacility.get(a.id) ?? 0 });
    }

    let missingValue = 0;
    let missingUnpriced = 0;
    let diffValue = 0;
    for (const r of result.rows) {
      if (r.status === 'saknas') {
        const options = assignmentsByTruckDay.get(`${r.regnr}|${r.datum}`) ?? [];
        const suggestion = suggestAssignment(options);
        r.options = options.map((a) => ({
          assignment_id: a.id, job_id: a.job_id, regnr: a.regnr, driver_name: a.driver_name, uppdragstyp: a.uppdragstyp,
          customer_name: a.customer_name, project_name: a.project_name, lass_to_facility: a.lass_to_facility,
        }));
        r.suggestion = suggestion ? { assignment_id: suggestion.id, job_id: suggestion.job_id } : null;
        r.estimate = suggestion ? estimate(ctx, ctx.jobs.get(suggestion.job_id), { material: r.material, nettoKg: r.netto_kg }) : null;
        if (r.estimate?.amount_ore != null) missingValue += r.estimate.amount_ore;
        else missingUnpriced++;
      }
      if (r.match) {
        const l = r.lass;
        r.lass = {
          lass_id: l.lass_id, datum: l.datum, tid: l.tid, vagsedel_nr: l.vagsedel_nr, vehicle_regnr: l.vehicle_regnr,
          netto_kg: l.netto_kg, review_status: l.review_status, invoiced: l.invoiced, customer_name: l.customer_name,
          project_name: l.project_name,
        };
        r.fixable = l.invoiced ? [] : r.differences.map((d) => d.field).filter((f) => FIXABLE.includes(f));
        const weight = r.differences.find((d) => d.field === 'netto_kg' && d.lass != null);
        const job = ctx.jobs.get(l.job_id);
        if (weight && job) {
          // What the difference is worth: the lass priced at the scale's weight minus at the logged weight.
          const at = (kg) => estimate(ctx, job, { material: l.material, nettoKg: kg }).amount_ore;
          const a = at(weight.list);
          const b = at(weight.lass);
          r.diff_value_ore = a != null && b != null ? a - b : null;
          if (r.diff_value_ore) diffValue += r.diff_value_ore;
        }
      }
    }

    return {
      list: {
        id: list.id, facility_name: list.facility_name, facility_orgnr: list.facility_orgnr, period_from: list.period_from,
        period_to: list.period_to, source_name: list.source_name, created_at: list.created_at,
        created_by_name: list.created_by_name, skipped: parseJson(list.skipped_json, []),
      },
      rows: result.rows,
      unlisted: result.unlisted.map((l) => ({
        lass_id: l.lass_id, datum: l.datum, tid: l.tid, vagsedel_nr: l.vagsedel_nr, vehicle_regnr: l.vehicle_regnr,
        netto_kg: l.netto_kg, material: l.material, till_namn: l.till_namn, review_status: l.review_status,
        customer_name: l.customer_name, project_name: l.project_name, invoiced: l.invoiced,
      })),
      totals: { ...result.totals, saknas_value_ore: missingValue, saknas_unpriced: missingUnpriced, diff_value_ore: diffValue },
    };
  }

  function loadRow(req, list) {
    const row = stmt.row.get(idParam(req.params.rowId), list.id, req.companyId);
    if (!row) throw notFound('Raden finns inte på våglistan.');
    return row;
  }

  /** The row as the reconciliation sees it now. */
  function reconciledRow(req, list, row) {
    return build(req.companyId, list).rows.find((r) => r.id === row.id);
  }

  // ── Lists ──

  router.get('/', (req, res) => {
    const ctx = pricingContext(req.companyId);
    res.json(stmt.lists.all(req.companyId).map((l) => {
      const { totals } = build(req.companyId, l, ctx);
      return {
        id: l.id, facility_name: l.facility_name, facility_orgnr: l.facility_orgnr, period_from: l.period_from,
        period_to: l.period_to, source_name: l.source_name, created_at: l.created_at, created_by_name: l.created_by_name, totals,
      };
    }));
  });

  // For Översikt: weighings on recent lists that still have no lass.
  router.get('/summary', (req, res) => {
    const ctx = pricingContext(req.companyId);
    const lists = stmt.recentLists.all(req.companyId, addDays(stockholmDate(), -120));
    const out = { lists: lists.length, saknas: 0, saknas_value_ore: 0, avvikelse: 0 };
    for (const l of lists) {
      const { totals } = build(req.companyId, l, ctx);
      out.saknas += totals.saknas;
      out.saknas_value_ore += totals.saknas_value_ore;
      out.avvikelse += totals.avvikelse;
    }
    res.json(out);
  });

  // Receivers the company's lass have gone to, for picking the facility when importing.
  router.get('/facilities', (req, res) => {
    res.json(stmt.facilities.all(req.companyId));
  });

  // Read a pasted or uploaded list without saving it: the suggested (or given) column mapping and the parsed rows.
  router.post('/preview', (req, res) => {
    const input = validate(previewSchema, req.body);
    try {
      res.json(previewWeighList(input.text, input.mapping ?? null));
    } catch (err) {
      if (err instanceof WeighListError) throw badRequest(err.message, { fields: { text: err.message } });
      throw err;
    }
  });

  router.post('/', (req, res) => {
    const input = validate(createSchema, req.body);
    let parsed;
    try {
      parsed = parseWeighList(input.text, input.mapping);
    } catch (err) {
      if (err instanceof WeighListError) throw badRequest(err.message);
      throw err;
    }
    if (!parsed.rows.length) throw badRequest('Inga rader kunde läsas. Kontrollera kolumnerna.');
    if (parsed.period.to > stockholmDate()) throw badRequest('Listan har vägningar med datum i framtiden. Kontrollera datumkolumnen.');
    if (parsed.rows.length > MAX_ROWS) throw badRequest(`Högst ${MAX_ROWS} rader per lista.`);

    const id = db.transaction(() => {
      const listId = Number(stmt.insertList.run({
        company_id: req.companyId, facility_name: input.facility_name, facility_orgnr: input.facility_orgnr ?? null,
        period_from: parsed.period.from, period_to: parsed.period.to, source_name: input.source_name ?? null,
        mapping_json: JSON.stringify(parsed.mapping), skipped_json: JSON.stringify(parsed.skipped.slice(0, 200)),
        created_by_user_id: req.user.id,
      }).lastInsertRowid);
      for (const r of parsed.rows) stmt.insertRow.run({ ...r, weigh_list_id: listId, company_id: req.companyId });
      return listId;
    })();
    audit({
      ...officeActor(req), entity: 'weigh_list', entityId: id, action: 'import',
      after: { facility: input.facility_name, rows: parsed.rows.length, skipped: parsed.skipped.length, period: parsed.period },
    });
    const list = stmt.list.get(id, req.companyId);
    res.status(201).json(build(req.companyId, list));
  });

  // ── One list ──

  router.get('/:id', (req, res) => {
    res.json(build(req.companyId, loadList(req)));
  });

  router.get('/:id/export.csv', (req, res) => {
    const list = loadList(req);
    const r = build(req.companyId, list);
    const kr = (ore) => (ore == null ? '' : (ore / 100).toFixed(2).replace('.', ','));
    const header = ['Rad', 'Datum', 'Tid', 'Vågsedel', 'Regnr', 'Material', 'Netto våglista (t)', 'Status', 'Lass i Åkaren',
      'Netto i Åkaren (t)', 'Avvikelse', 'Kund / projekt', 'Uppskattat värde (kr)', 'Anteckning'];
    const lines = [header.map(csvCell).join(';')];
    for (const row of r.rows) {
      lines.push([
        row.line_no, row.datum, row.tid, row.vagsedel_nr, row.regnr, row.material, kgToTonCell(row.netto_kg), STATUS_TEXT[row.status],
        row.lass?.vagsedel_nr ?? (row.lass ? `#${row.lass.lass_id}` : ''), kgToTonCell(row.lass?.netto_kg ?? null),
        row.differences.map((d) => FIELD_TEXT[d.field]).join(', '),
        row.lass ? `${row.lass.customer_name} / ${row.lass.project_name}` : '',
        kr(row.status === 'saknas' ? row.estimate?.amount_ore : row.diff_value_ore),
        row.resolution_note ?? '',
      ].map(csvCell).join(';'));
    }
    for (const l of r.unlisted) {
      lines.push(['', l.datum, l.tid, l.vagsedel_nr, l.vehicle_regnr, l.material, '', 'Inte på våglistan', l.vagsedel_nr ?? `#${l.lass_id}`,
        kgToTonCell(l.netto_kg), '', `${l.customer_name} / ${l.project_name}`, '', ''].map(csvCell).join(';'));
    }
    const name = `avstamning-${fileSlug(list.facility_name)}-${list.period_from}-${list.period_to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  });

  router.delete('/:id', (req, res) => {
    const list = loadList(req);
    if (stmt.createdCount.pluck().get(list.id) > 0) {
      throw conflict('has_lass', 'Lass har skapats från listan, så den kan inte tas bort. Lassen finns kvar i Granska lass.');
    }
    stmt.deleteList.run(list.id, req.companyId);
    audit({ ...officeActor(req), entity: 'weigh_list', entityId: list.id, action: 'delete', before: { facility: list.facility_name, period_from: list.period_from, period_to: list.period_to } });
    res.status(204).end();
  });

  // ── One row ──

  // The suggested waste code for a weighing logged on a job: from the job's latest lass with the same material.
  router.get('/:id/rows/:rowId/suggest', (req, res) => {
    const list = loadList(req);
    const row = loadRow(req, list);
    const job = stmt.job.get(idParam(req.query.job_id), req.companyId);
    if (!job) throw notFound('Uppdraget finns inte.');
    const material = row.material ?? job.material ?? null;
    const last = stmt.lastOnJob.get(req.companyId, job.id, material, material) ?? stmt.lastOnJob.get(req.companyId, job.id, null, null);
    const ctx = pricingContext(req.companyId);
    res.json({
      material,
      avfallskod: last?.avfallskod ?? null,
      farligt_avfall: Boolean(last?.farligt_avfall),
      estimate: estimate(ctx, job, { material, nettoKg: row.netto_kg }),
    });
  });

  // Log the weighing as a lass on the job the office picked. The row is the lass's evidence.
  router.post('/:id/rows/:rowId/lass', (req, res) => {
    const list = loadList(req);
    const row = loadRow(req, list);
    const input = validate(createLassSchema, req.body);
    const current = reconciledRow(req, list, row);
    if (current.status !== 'saknas' && current.status !== 'ignorerad') {
      throw conflict('already_matched', 'Det finns redan ett lass för vägningen.', { lass_id: current.match?.lass_id ?? null });
    }
    const job = stmt.job.get(input.job_id, req.companyId);
    if (!job) throw badRequest('Uppdraget finns inte.', { fields: { job_id: 'Välj ett uppdrag.' } });
    if (job.status === 'avbruten') throw conflict('job_cancelled', 'Uppdraget är avbrutet.');
    let assignment = null;
    if (input.assignment_id) {
      assignment = stmt.assignment.get(input.assignment_id, job.id, req.companyId);
      if (!assignment) throw badRequest('Tilldelningen finns inte på uppdraget.', { fields: { assignment_id: 'Välj en tilldelning på uppdraget.' } });
    }
    if (row.datum > stockholmDate()) throw badRequest('Vägningen har ett datum i framtiden.');

    const values = {
      vagsedel_nr: row.vagsedel_nr, datum: row.datum, tid: row.tid, material: input.material ?? row.material ?? job.material ?? null,
      netto_kg: row.netto_kg, avfallskod: input.avfallskod ?? null, farligt_avfall: Boolean(input.farligt_avfall),
      fran_text: job.fran_text ?? null, till_namn: list.facility_name, till_orgnr: list.facility_orgnr ?? null, till_adress: null,
    };
    const regnr = row.regnr ?? assignment?.regnr ?? null;
    const created = db.transaction(() => {
      const { lass: l } = lassService.create({
        companyId: req.companyId, jobId: job.id, assignmentId: assignment?.id ?? null,
        customerId: job.customer_id, projectId: job.project_id, vehicleRegnr: regnr, driverId: assignment?.driver_id ?? null,
        values, confidence: submittedConfidence(values, null, 'kontor'),
        regnrMismatch: Boolean(assignment && row.regnr && regnrKey(assignment.regnr) !== row.regnr),
        note: `Från våglista: ${list.facility_name}, rad ${row.line_no}`, weighListRowId: row.id,
        createdByKind: 'office', createdByUserId: req.user.id,
      });
      if (stmt.resolveCreated.run(l.lass_id, req.user.id, row.id).changes !== 1) throw conflict('already_resolved', 'Raden är redan hanterad.');
      return l;
    })();
    audit({
      ...officeActor(req), entity: 'lass', entityId: created.lass_id, action: 'create_from_weigh_list',
      after: { weigh_list_id: list.id, row: row.line_no, job_id: job.id, netto_kg: row.netto_kg, review: created.review_status },
    });
    res.status(201).json({ lass: created });
  });

  // Correct the matched lass with the scale's values: a new lass version with the reason on it.
  router.post('/:id/rows/:rowId/fix', (req, res) => {
    const list = loadList(req);
    const row = loadRow(req, list);
    const input = validate(fixSchema, req.body);
    const current = reconciledRow(req, list, row);
    if (!current.match) throw conflict('not_matched', 'Vägningen har inget lass att rätta.');
    if (current.lass.invoiced) throw conflict('invoiced', 'Lasset är redan fakturerat och kan inte ändras. Justera fakturan i Fortnox.');
    const differing = new Set(current.differences.map((d) => d.field));
    const fields = [...new Set(input.fields)].filter((f) => differing.has(f));
    if (!fields.length) throw badRequest('Värdena stämmer redan med våglistan.');
    if (fields.includes('datum') && row.datum > stockholmDate()) throw badRequest('Datumet kan inte vara i framtiden.');
    const patch = Object.fromEntries(fields.map((f) => [f, row[f]]));
    const before = lassService.current(current.match.lass_id, req.companyId);
    const updated = lassService.addVersion({
      lassId: before.lass_id, companyId: req.companyId, patch,
      changeReason: `Rättad enligt våglista från ${list.facility_name} (rad ${row.line_no})`, personKind: 'kontor',
      reviewStatus: before.review_status === 'granskad' ? 'granskad' : null,
      createdByKind: 'office', createdByUserId: req.user.id,
    });
    audit({
      ...officeActor(req), entity: 'lass', entityId: before.lass_id, action: 'correct_from_weigh_list',
      before: Object.fromEntries(fields.map((f) => [f, before[f]])),
      after: { version: updated.version, weigh_list_id: list.id, row: row.line_no, ...patch },
    });
    res.status(201).json({ lass: updated });
  });

  router.post('/:id/rows/:rowId/ignore', (req, res) => {
    const list = loadList(req);
    const row = loadRow(req, list);
    const input = validate(ignoreSchema, req.body);
    const current = reconciledRow(req, list, row);
    if (current.status !== 'saknas') throw conflict('not_missing', 'Bara vägningar utan lass kan ignoreras.');
    if (stmt.resolveIgnored.run(input.reason, req.user.id, row.id).changes !== 1) throw conflict('already_resolved', 'Raden är redan hanterad.');
    audit({ ...officeActor(req), entity: 'weigh_list', entityId: list.id, action: 'ignore_row', after: { row: row.line_no, reason: input.reason } });
    res.status(201).json(reconciledRow(req, list, row));
  });

  router.delete('/:id/rows/:rowId/ignore', (req, res) => {
    const list = loadList(req);
    const row = loadRow(req, list);
    if (stmt.unignore.run(row.id).changes !== 1) throw notFound('Raden är inte ignorerad.');
    audit({ ...officeActor(req), entity: 'weigh_list', entityId: list.id, action: 'unignore_row', before: { row: row.line_no, reason: row.resolution_note } });
    res.json(reconciledRow(req, list, row));
  });

  return router;
}
