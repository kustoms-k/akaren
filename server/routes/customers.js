import { Router } from 'express';
import { z } from 'zod';
import { validate, idParam, notFound, conflict, badRequest } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { updateScoped, isUniqueViolation } from '../lib/sql.js';
import { requiredText, optionalText, orgNr, phone, email, postnr, bool01, idRef } from '../lib/schemas.js';

const fields = {
  name: requiredText(200),
  org_nr: orgNr,
  address: optionalText(200),
  postnr,
  ort: optionalText(100),
  email,
  phone,
  price_list_id: idRef.nullable().optional(),
  vat_mode: z.enum(['normal', 'omvand_bygg'], { error: 'Ogiltigt momsläge.' }).nullable().optional(),
  active: bool01.optional(),
};
const createSchema = z.object(fields).strict();
const patchSchema = z.object({ ...fields, name: fields.name.optional() }).strict();

export function customersRouter({ db, audit }) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id AND p.active = 1) AS project_count
    FROM customers c
    WHERE c.company_id = @cid
      AND (@all = 1 OR c.active = 1)
      AND (@q IS NULL OR c.name LIKE @like OR c.org_nr LIKE @like)
    ORDER BY c.name COLLATE NOCASE
  `);
  const stmtGet = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?');
  const stmtProjects = db.prepare('SELECT * FROM projects WHERE customer_id = ? AND company_id = ? ORDER BY active DESC, name COLLATE NOCASE');
  const stmtByOrg = db.prepare('SELECT id, name FROM customers WHERE company_id = ? AND org_nr = ?');
  const stmtPriceList = db.prepare('SELECT id FROM price_lists WHERE id = ? AND company_id = ?');
  const stmtInsert = db.prepare(`
    INSERT INTO customers (company_id, name, org_nr, address, postnr, ort, email, phone, price_list_id, vat_mode, active)
    VALUES (@company_id, @name, @org_nr, @address, @postnr, @ort, @email, @phone, @price_list_id, @vat_mode, @active)
  `);

  function assertPriceList(companyId, id) {
    if (id != null && !stmtPriceList.get(id, companyId)) throw badRequest('Prislistan finns inte.', { fields: { price_list_id: 'Prislistan finns inte.' } });
  }

  function duplicateOrg(companyId, org, exceptId) {
    if (!org) return;
    const hit = stmtByOrg.get(companyId, org);
    if (hit && hit.id !== exceptId) {
      throw conflict('duplicate_org_nr', `Det finns redan en kund med organisationsnummer ${org}: ${hit.name}.`, { existing_id: hit.id });
    }
  }

  router.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;
    res.json(stmtList.all({ cid: req.companyId, all: req.query.all === '1' ? 1 : 0, q, like: q && `%${q}%` }));
  });

  router.get('/:id', (req, res) => {
    const customer = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!customer) throw notFound('Kunden finns inte.');
    res.json({ ...customer, projects: stmtProjects.all(customer.id, req.companyId) });
  });

  router.post('/', (req, res) => {
    const data = validate(createSchema, req.body);
    duplicateOrg(req.companyId, data.org_nr);
    assertPriceList(req.companyId, data.price_list_id);
    try {
      const { lastInsertRowid } = stmtInsert.run({
        company_id: req.companyId,
        address: null, postnr: null, ort: null, email: null, phone: null, org_nr: null,
        price_list_id: null, vat_mode: null, active: 1,
        ...data,
      });
      const created = stmtGet.get(lastInsertRowid, req.companyId);
      audit({ ...officeActor(req), entity: 'customer', entityId: created.id, action: 'create', after: created });
      res.status(201).json(created);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('duplicate', 'Kunden finns redan.');
      throw err;
    }
  });

  router.patch('/:id', (req, res) => {
    const id = idParam(req.params.id);
    const before = stmtGet.get(id, req.companyId);
    if (!before) throw notFound('Kunden finns inte.');
    const data = validate(patchSchema, req.body);
    duplicateOrg(req.companyId, data.org_nr, id);
    assertPriceList(req.companyId, data.price_list_id);
    updateScoped(db, 'customers', id, req.companyId, data, { touchUpdatedAt: true });
    const after = stmtGet.get(id, req.companyId);
    audit({ ...officeActor(req), entity: 'customer', entityId: id, action: 'update', before, after });
    res.json(after);
  });

  return router;
}
