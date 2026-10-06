import { Router } from 'express';
import { z } from 'zod';
import { HttpError, asyncHandler, validate, idParam, notFound, conflict, badRequest } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { optionalText, phone, email, date, idRef } from '../lib/schemas.js';
import { suggestMatches, confidentPick, similarNames } from '../lib/match.js';
import {
  ORDER_FIELDS, UPPDRAGSTYPER, MANGD_ENHETER, REQUIRED_JOB_FIELDS, emptyOrderFields,
} from '../lib/orderExtraction.js';
import { AiNotConfiguredError, AiBudgetExceededError, AiExtractionError, AiDemoNoMatchError } from '../services/ai.js';
import { customerCreateSchema } from './customers.js';
import { projectNewSchema } from './projects.js';

const MAX_TEXT = 20_000;

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalNumber = (schema) => z.preprocess(blankToNull, schema.nullable().optional());

// Job fields the office confirms. Keys match the extraction keys so AI values can be compared.
const jobFieldsSchema = z.object({
  uppdragstyp: z.enum(UPPDRAGSTYPER, { error: 'Välj uppdragstyp.' }),
  datum: date,
  datum_till: z.preprocess(blankToNull, date.nullable().optional()),
  tid: z.preprocess(blankToNull, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ange tid som TT:MM.').nullable().optional()),
  material: optionalText(120),
  uppskattad_mangd: optionalNumber(z.coerce.number().positive('Mängden måste vara större än 0.').max(100_000)),
  mangd_enhet: z.preprocess(blankToNull, z.enum(MANGD_ENHETER).nullable().optional()),
  antal_lass: optionalNumber(z.coerce.number().int('Ange ett heltal.').min(1).max(1000)),
  fran: optionalText(200),
  till: optionalText(200),
  instruktioner: optionalText(1000),
  kontaktperson: optionalText(120),
  telefon: phone,
  epost: email,
}).strict().refine((f) => !f.datum_till || f.datum_till >= f.datum, {
  path: ['datum_till'], message: 'Slutdatum måste vara samma dag eller senare.',
});

const JOB_KEYS = ['uppdragstyp', 'datum', 'datum_till', 'tid', 'material', 'uppskattad_mangd', 'mangd_enhet',
  'antal_lass', 'fran', 'till', 'instruktioner', 'kontaktperson', 'telefon', 'epost'];

const confirmSchema = z.object({
  fields: jobFieldsSchema,
  customer: z.union([
    z.object({ id: idRef }).strict(),
    z.object({ new: customerCreateSchema, allow_similar: z.boolean().optional() }).strict(),
  ], { error: 'Välj en kund eller skapa en ny.' }),
  project: z.union([
    z.object({ id: idRef }).strict(),
    z.object({ new: projectNewSchema, allow_similar: z.boolean().optional() }).strict(),
  ], { error: 'Välj ett projekt eller skapa ett nytt.' }),
  acknowledged: z.array(z.enum(ORDER_FIELDS)).default([]),
}).strict();

const sameValue = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

/** Map AI service errors to user-facing HTTP errors (Swedish). */
function aiHttpError(err) {
  if (err instanceof AiNotConfiguredError) {
    return new HttpError(503, 'ai_not_configured', 'AI-tolkning är inte aktiverad (ANTHROPIC_API_KEY saknas i server/.env). Fyll i beställningen manuellt så länge.');
  }
  if (err instanceof AiDemoNoMatchError) {
    return new HttpError(422, 'ai_demo_no_match', 'Demoläge: AI-tolkningen fungerar bara på exempelbeställningarna. Välj ett exempel ovanför textrutan, eller fyll i manuellt.');
  }
  if (err instanceof AiBudgetExceededError) {
    return new HttpError(429, 'ai_budget_exceeded', `Månadens AI-budget är slut (${err.spentUsd} av ${err.budgetUsd} USD). Höj AI_MONTHLY_BUDGET_USD eller fyll i manuellt.`);
  }
  if (err instanceof AiExtractionError) {
    const msg = {
      refusal: 'AI:n kunde inte tolka texten. Fyll i beställningen manuellt.',
      truncated: 'Texten var för lång för att tolkas. Korta ner den och försök igen.',
      invalid_output: 'AI:n gav ett ofullständigt svar. Försök igen.',
      api_error: 'Kunde inte nå AI-tjänsten. Försök igen om en stund.',
    }[err.reason];
    return new HttpError(502, `ai_${err.reason}`, msg);
  }
  return err;
}

export function intakeRouter({ db, audit, ai, limiters }) {
  const router = Router();

  const stmtCompany = db.prepare('SELECT name FROM companies WHERE id = ?');
  const stmtInsert = db.prepare(`
    INSERT INTO order_intakes (company_id, raw_text, ai_extraction_id, created_by_user_id)
    VALUES (?, ?, ?, ?)
  `);
  const stmtGet = db.prepare(`
    SELECT i.*, e.fields_json, e.model, u.name AS created_by_name
    FROM order_intakes i
    LEFT JOIN ai_extractions e ON e.id = i.ai_extraction_id
    LEFT JOIN users u ON u.id = i.created_by_user_id
    WHERE i.id = ? AND i.company_id = ?
  `);
  const stmtList = db.prepare(`
    SELECT i.id, i.status, i.created_at, i.job_id, substr(i.raw_text, 1, 160) AS snippet,
           e.fields_json, u.name AS created_by_name
    FROM order_intakes i
    LEFT JOIN ai_extractions e ON e.id = i.ai_extraction_id
    LEFT JOIN users u ON u.id = i.created_by_user_id
    WHERE i.company_id = ? AND i.status = ?
    ORDER BY i.created_at DESC
    LIMIT 50
  `);
  const stmtCustomers = db.prepare('SELECT id, name, org_nr, email FROM customers WHERE company_id = ? AND active = 1');
  const stmtProjects = db.prepare(`
    SELECT p.id, p.name, p.customer_id, p.address, p.customer_ref, p.miljozon, c.name AS customer_name
    FROM projects p JOIN customers c ON c.id = p.customer_id
    WHERE p.company_id = ? AND p.active = 1
  `);
  const stmtCustomerById = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?');
  const stmtProjectById = db.prepare('SELECT * FROM projects WHERE id = ? AND company_id = ?');
  const stmtByOrg = db.prepare('SELECT id, name FROM customers WHERE company_id = ? AND org_nr = ?');
  const stmtCustomerProjects = db.prepare('SELECT id, name FROM projects WHERE customer_id = ? AND company_id = ?');
  const stmtInsertCustomer = db.prepare(`
    INSERT INTO customers (company_id, name, org_nr, address, postnr, ort, email, phone, price_list_id, vat_mode)
    VALUES (@company_id, @name, @org_nr, @address, @postnr, @ort, @email, @phone, @price_list_id, @vat_mode)
  `);
  const stmtInsertProject = db.prepare(`
    INSERT INTO projects (company_id, customer_id, name, customer_ref, address, postnr, ort, miljozon, kontaktperson, telefon, price_list_id)
    VALUES (@company_id, @customer_id, @name, @customer_ref, @address, @postnr, @ort, @miljozon, @kontaktperson, @telefon, @price_list_id)
  `);
  const stmtInsertJob = db.prepare(`
    INSERT INTO jobs (company_id, customer_id, project_id, order_intake_id, uppdragstyp, material, uppskattad_mangd,
      mangd_enhet, antal_lass, datum_fran, datum_till, tid, fran_text, till_text, instruktioner, kontaktperson, telefon,
      epost, created_by_user_id)
    VALUES (@company_id, @customer_id, @project_id, @order_intake_id, @uppdragstyp, @material, @uppskattad_mangd,
      @mangd_enhet, @antal_lass, @datum_fran, @datum_till, @tid, @fran_text, @till_text, @instruktioner, @kontaktperson,
      @telefon, @epost, @created_by_user_id)
  `);
  const stmtConfirm = db.prepare(`
    UPDATE order_intakes
    SET status = 'bekraftad', job_id = ?, confirmed_by_user_id = ?, confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        final_json = ?, overrides_json = ?
    WHERE id = ? AND company_id = ? AND status = 'utkast'
  `);
  // The inbox email an intake was started from, if any.
  const stmtSourceEmail = db.prepare(`
    SELECT id, thread_id, from_name, from_email, subject, received_at FROM inbound_emails
    WHERE order_intake_id = ? AND company_id = ? LIMIT 1
  `);
  const stmtEmailJob = db.prepare('UPDATE inbound_emails SET job_id = ? WHERE order_intake_id = ? AND company_id = ?');
  const stmtDiscard = db.prepare(`UPDATE order_intakes SET status = 'kasserad' WHERE id = ? AND company_id = ? AND status = 'utkast'`);

  const parseExtraction = (json) => {
    if (!json) return { fields: emptyOrderFields(), warnings: [] };
    try { return JSON.parse(json); } catch { return { fields: emptyOrderFields(), warnings: [] }; }
  };

  /** Full intake view including fresh match suggestions (master data may have changed). */
  function view(intake) {
    const { fields, warnings } = parseExtraction(intake.fields_json);
    const suggestions = suggestMatches({
      customers: stmtCustomers.all(intake.company_id),
      projects: stmtProjects.all(intake.company_id),
      fields,
      rawText: intake.raw_text,
    });
    const customerPick = confidentPick(suggestions.customers);
    const projectPick = confidentPick(suggestions.projects.filter((p) => !customerPick || p.customer_id === customerPick.id));
    return {
      id: intake.id,
      status: intake.status,
      raw_text: intake.raw_text,
      created_at: intake.created_at,
      created_by_name: intake.created_by_name,
      job_id: intake.job_id,
      source: intake.ai_extraction_id ? 'ai' : 'manuell',
      model: intake.model ?? null,
      fields,
      warnings,
      required: REQUIRED_JOB_FIELDS,
      suggestions,
      preselect: { customer_id: customerPick?.id ?? null, project_id: projectPick?.id ?? null },
      email: stmtSourceEmail.get(intake.id, intake.company_id) ?? null,
    };
  }

  function load(req) {
    const intake = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!intake) throw notFound('Beställningen finns inte.');
    return intake;
  }

  router.get('/', (req, res) => {
    const status = ['utkast', 'bekraftad', 'kasserad'].includes(req.query.status) ? req.query.status : 'utkast';
    res.json(stmtList.all(req.companyId, status).map((row) => {
      const { fields } = parseExtraction(row.fields_json);
      return {
        id: row.id, status: row.status, created_at: row.created_at, job_id: row.job_id,
        snippet: row.snippet, created_by_name: row.created_by_name,
        kund: fields.kund?.value ?? null, datum: fields.datum?.value ?? null, uppdragstyp: fields.uppdragstyp?.value ?? null,
      };
    }));
  });

  const textSchema = z.object({
    text: z.string({ error: 'Klistra in beställningen.' }).trim()
      .min(10, 'Texten är för kort för att vara en beställning.')
      .max(MAX_TEXT, `Högst ${MAX_TEXT} tecken.`),
  }).strict();

  router.post('/extract', limiters.ai, asyncHandler(async (req, res) => {
    const { text } = validate(textSchema, req.body);
    let result;
    try {
      result = await ai.extractOrder({ companyId: req.companyId, companyName: stmtCompany.get(req.companyId).name, text });
    } catch (err) {
      throw aiHttpError(err);
    }
    const id = Number(stmtInsert.run(req.companyId, text, result.extractionId, req.user.id).lastInsertRowid);
    audit({ ...officeActor(req), entity: 'order_intake', entityId: id, action: 'extract', after: { extraction_id: result.extractionId } });
    res.status(201).json(view(stmtGet.get(id, req.companyId)));
  }));

  router.get('/demo-samples', (req, res) => {
    res.json(ai.demoSamples?.() ?? []);
  });

  router.post('/manual', (req, res) => {
    const { text } = validate(z.object({ text: optionalText(MAX_TEXT) }).strict(), req.body);
    const id = Number(stmtInsert.run(req.companyId, text ?? '', null, req.user.id).lastInsertRowid);
    audit({ ...officeActor(req), entity: 'order_intake', entityId: id, action: 'create_manual' });
    res.status(201).json(view(stmtGet.get(id, req.companyId)));
  });

  router.get('/:id', (req, res) => {
    res.json(view(load(req)));
  });

  router.post('/:id/discard', (req, res) => {
    const intake = load(req);
    if (stmtDiscard.run(intake.id, req.companyId).changes === 0) {
      throw conflict('not_draft', 'Beställningen är redan hanterad.');
    }
    audit({ ...officeActor(req), entity: 'order_intake', entityId: intake.id, action: 'discard' });
    res.json({ ok: true });
  });

  router.post('/:id/confirm', (req, res) => {
    const intake = load(req);
    if (intake.status !== 'utkast') throw conflict('not_draft', 'Beställningen är redan hanterad.');
    const input = validate(confirmSchema, req.body);
    const { fields: extracted } = parseExtraction(intake.fields_json);

    // Human-in-the-loop gate: every low-confidence AI value must have been changed or explicitly accepted.
    const ack = new Set(input.acknowledged);
    const unresolved = JOB_KEYS.filter((k) => {
      const ex = extracted[k];
      return ex?.confidence === 'lag' && ex.value != null && sameValue(input.fields[k], ex.value) && !ack.has(k);
    });
    if (unresolved.length) {
      throw badRequest('Kontrollera de osäkra fälten innan uppdraget skapas.', {
        code: 'unreviewed_fields',
        fields: Object.fromEntries(unresolved.map((k) => [`fields.${k}`, 'Osäkert värde. Ändra eller bekräfta.'])),
      });
    }

    const result = db.transaction(() => {
      // Customer: existing, or new with a duplicate guard.
      let customerId;
      if (input.customer.id) {
        if (!stmtCustomerById.get(input.customer.id, req.companyId)) throw badRequest('Kunden finns inte.');
        customerId = input.customer.id;
      } else {
        const c = input.customer.new;
        if (c.org_nr) {
          const hit = stmtByOrg.get(req.companyId, c.org_nr);
          if (hit) throw conflict('duplicate_org_nr', `Det finns redan en kund med organisationsnummer ${c.org_nr}: ${hit.name}.`, { existing_id: hit.id });
        }
        const similar = similarNames(c.name, stmtCustomers.all(req.companyId));
        if (similar.length && !input.customer.allow_similar) {
          throw conflict('similar_customer', `Det finns redan en kund som liknar ”${c.name}”. Välj den eller bekräfta att det är en ny kund.`, {
            candidates: similar.slice(0, 3).map(({ id, name, org_nr }) => ({ id, name, org_nr })),
          });
        }
        customerId = Number(stmtInsertCustomer.run({
          company_id: req.companyId, name: c.name, org_nr: c.org_nr ?? null, address: c.address ?? null,
          postnr: c.postnr ?? null, ort: c.ort ?? null, email: c.email ?? null, phone: c.phone ?? null,
          price_list_id: null, vat_mode: c.vat_mode ?? null,
        }).lastInsertRowid);
        audit({ ...officeActor(req), entity: 'customer', entityId: customerId, action: 'create', after: { ...c, via: 'order_intake' } });
      }

      // Project: existing (must belong to the customer), or new under the customer.
      let projectId;
      if (input.project.id) {
        const p = stmtProjectById.get(input.project.id, req.companyId);
        if (!p) throw badRequest('Projektet finns inte.');
        if (p.customer_id !== customerId) throw badRequest('Projektet tillhör en annan kund.', { code: 'project_customer_mismatch' });
        projectId = p.id;
      } else {
        const p = input.project.new;
        const similar = similarNames(p.name, stmtCustomerProjects.all(customerId, req.companyId));
        if (similar.length && !input.project.allow_similar) {
          throw conflict('similar_project', `Kunden har redan ett projekt som liknar ”${p.name}”. Välj det eller bekräfta att det är nytt.`, {
            candidates: similar.slice(0, 3).map(({ id, name }) => ({ id, name })),
          });
        }
        projectId = Number(stmtInsertProject.run({
          company_id: req.companyId, customer_id: customerId, name: p.name, customer_ref: p.customer_ref ?? null,
          address: p.address ?? null, postnr: p.postnr ?? null, ort: p.ort ?? null, miljozon: p.miljozon ?? 0,
          kontaktperson: p.kontaktperson ?? null, telefon: p.telefon ?? null, price_list_id: null,
        }).lastInsertRowid);
        audit({ ...officeActor(req), entity: 'project', entityId: projectId, action: 'create', after: { ...p, via: 'order_intake' } });
      }

      const f = input.fields;
      const jobId = Number(stmtInsertJob.run({
        company_id: req.companyId, customer_id: customerId, project_id: projectId, order_intake_id: intake.id,
        uppdragstyp: f.uppdragstyp, material: f.material ?? null, uppskattad_mangd: f.uppskattad_mangd ?? null,
        mangd_enhet: f.mangd_enhet ?? null, antal_lass: f.antal_lass ?? null, datum_fran: f.datum,
        datum_till: f.datum_till ?? null, tid: f.tid ?? null, fran_text: f.fran ?? null, till_text: f.till ?? null,
        instruktioner: f.instruktioner ?? null, kontaktperson: f.kontaktperson ?? null, telefon: f.telefon ?? null,
        epost: f.epost ?? null, created_by_user_id: req.user.id,
      }).lastInsertRowid);

      // Record what the human changed or accepted relative to the AI.
      const overrides = {};
      for (const k of JOB_KEYS) {
        const ex = extracted[k];
        if (!sameValue(f[k], ex?.value)) overrides[k] = { ai: ex?.value ?? null, final: f[k] ?? null };
      }
      stmtConfirm.run(jobId, req.user.id, JSON.stringify(input), JSON.stringify({ changed: overrides, acknowledged: input.acknowledged }),
        intake.id, req.companyId);
      stmtEmailJob.run(jobId, intake.id, req.companyId);
      audit({ ...officeActor(req), entity: 'job', entityId: jobId, action: 'create', after: { order_intake_id: intake.id, ...f } });
      return { job_id: jobId, customer_id: customerId, project_id: projectId };
    })();

    res.status(201).json(result);
  });

  return router;
}
