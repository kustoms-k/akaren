import { Router } from 'express';
import { z } from 'zod';
import { validate, idParam, notFound, badRequest } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { updateScoped } from '../lib/sql.js';
import { requiredText, optionalText, phone, postnr, bool01, idRef, zoneClass } from '../lib/schemas.js';

const fields = {
  customer_id: idRef,
  name: requiredText(200),
  customer_ref: optionalText(100),
  address: optionalText(200),
  postnr,
  ort: optionalText(100),
  miljozon: zoneClass.optional(),
  kontaktperson: optionalText(120),
  telefon: phone,
  price_list_id: idRef.nullable().optional(),
  active: bool01.optional(),
};
const createSchema = z.object(fields).strict();
/** Project fields without customer_id, for creating a project as part of another flow. */
export const projectNewSchema = createSchema.omit({ customer_id: true });
const patchSchema = z.object({ ...fields, customer_id: idRef.optional(), name: fields.name.optional() }).strict();

export function projectsRouter({ db, audit }) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT p.*, c.name AS customer_name
    FROM projects p JOIN customers c ON c.id = p.customer_id
    WHERE p.company_id = @cid
      AND (@customerId IS NULL OR p.customer_id = @customerId)
      AND (@all = 1 OR p.active = 1)
    ORDER BY c.name COLLATE NOCASE, p.name COLLATE NOCASE
  `);
  const stmtGet = db.prepare(`
    SELECT p.*, c.name AS customer_name
    FROM projects p JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ? AND p.company_id = ?
  `);
  const stmtCustomer = db.prepare('SELECT id FROM customers WHERE id = ? AND company_id = ?');
  const stmtPriceList = db.prepare('SELECT id FROM price_lists WHERE id = ? AND company_id = ?');
  const stmtInsert = db.prepare(`
    INSERT INTO projects (company_id, customer_id, name, customer_ref, address, postnr, ort, miljozon,
                          kontaktperson, telefon, price_list_id, active)
    VALUES (@company_id, @customer_id, @name, @customer_ref, @address, @postnr, @ort, @miljozon,
            @kontaktperson, @telefon, @price_list_id, @active)
  `);

  function assertRefs(companyId, data) {
    if (data.customer_id != null && !stmtCustomer.get(data.customer_id, companyId)) {
      throw badRequest('Kunden finns inte.', { fields: { customer_id: 'Kunden finns inte.' } });
    }
    if (data.price_list_id != null && !stmtPriceList.get(data.price_list_id, companyId)) {
      throw badRequest('Prislistan finns inte.', { fields: { price_list_id: 'Prislistan finns inte.' } });
    }
  }

  router.get('/', (req, res) => {
    const customerId = req.query.customer_id ? Number(req.query.customer_id) || -1 : null;
    res.json(stmtList.all({ cid: req.companyId, customerId, all: req.query.all === '1' ? 1 : 0 }));
  });

  router.get('/:id', (req, res) => {
    const project = stmtGet.get(idParam(req.params.id), req.companyId);
    if (!project) throw notFound('Projektet finns inte.');
    res.json(project);
  });

  router.post('/', (req, res) => {
    const data = validate(createSchema, req.body);
    assertRefs(req.companyId, data);
    const { lastInsertRowid } = stmtInsert.run({
      company_id: req.companyId,
      customer_ref: null, address: null, postnr: null, ort: null, miljozon: 0,
      kontaktperson: null, telefon: null, price_list_id: null, active: 1,
      ...data,
    });
    const created = stmtGet.get(lastInsertRowid, req.companyId);
    audit({ ...officeActor(req), entity: 'project', entityId: created.id, action: 'create', after: created });
    res.status(201).json(created);
  });

  router.patch('/:id', (req, res) => {
    const id = idParam(req.params.id);
    const before = stmtGet.get(id, req.companyId);
    if (!before) throw notFound('Projektet finns inte.');
    const data = validate(patchSchema, req.body);
    assertRefs(req.companyId, data);
    updateScoped(db, 'projects', id, req.companyId, data, { touchUpdatedAt: true });
    const after = stmtGet.get(id, req.companyId);
    audit({ ...officeActor(req), entity: 'project', entityId: id, action: 'update', before, after });
    res.json(after);
  });

  return router;
}
