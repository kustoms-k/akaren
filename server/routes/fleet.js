import { Router } from 'express';
import { z } from 'zod';
import { validate, idParam, notFound, conflict } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { updateScoped, isUniqueViolation } from '../lib/sql.js';
import { requiredText, regnr, requiredPhone, bool01, zoneClass } from '../lib/schemas.js';

export const VEHICLE_TYPES = ['tippbil', 'kranbil', 'lastvaxlare', 'trailer', 'ovrigt'];

const vehicleFields = {
  regnr,
  typ: z.enum(VEHICLE_TYPES, { error: 'Välj fordonstyp.' }),
  miljozonsklass: zoneClass.optional(),
  active: bool01.optional(),
};
const vehicleCreate = z.object(vehicleFields).strict();
const vehiclePatch = z.object({
  regnr: vehicleFields.regnr.optional(),
  typ: vehicleFields.typ.optional(),
  miljozonsklass: vehicleFields.miljozonsklass,
  active: vehicleFields.active,
}).strict();

const driverFields = {
  name: requiredText(120),
  phone: requiredPhone,
  active: bool01.optional(),
};
const driverCreate = z.object(driverFields).strict();
const driverPatch = z.object({
  name: driverFields.name.optional(),
  phone: driverFields.phone.optional(),
  active: driverFields.active,
}).strict();

/** Vehicles: regnr, typ, miljözonsklass, active. Nothing more by design. */
export function vehiclesRouter({ db, audit }) {
  const router = Router();
  const stmtList = db.prepare('SELECT * FROM vehicles WHERE company_id = ? AND (? = 1 OR active = 1) ORDER BY active DESC, regnr');
  const stmtGet = db.prepare('SELECT * FROM vehicles WHERE id = ? AND company_id = ?');
  const stmtInsert = db.prepare(`
    INSERT INTO vehicles (company_id, regnr, typ, miljozonsklass, active)
    VALUES (@company_id, @regnr, @typ, @miljozonsklass, @active)
  `);
  const dup = (r) => conflict('duplicate_regnr', `Fordonet ${r} finns redan.`);

  router.get('/', (req, res) => {
    res.json(stmtList.all(req.companyId, req.query.all === '1' ? 1 : 0));
  });

  router.post('/', (req, res) => {
    const data = validate(vehicleCreate, req.body);
    try {
      const { lastInsertRowid } = stmtInsert.run({ company_id: req.companyId, miljozonsklass: 0, active: 1, ...data });
      const created = stmtGet.get(lastInsertRowid, req.companyId);
      audit({ ...officeActor(req), entity: 'vehicle', entityId: created.id, action: 'create', after: created });
      res.status(201).json(created);
    } catch (err) {
      if (isUniqueViolation(err)) throw dup(data.regnr);
      throw err;
    }
  });

  router.patch('/:id', (req, res) => {
    const id = idParam(req.params.id);
    const before = stmtGet.get(id, req.companyId);
    if (!before) throw notFound('Fordonet finns inte.');
    const data = validate(vehiclePatch, req.body);
    try {
      updateScoped(db, 'vehicles', id, req.companyId, data);
    } catch (err) {
      if (isUniqueViolation(err)) throw dup(data.regnr);
      throw err;
    }
    const after = stmtGet.get(id, req.companyId);
    audit({ ...officeActor(req), entity: 'vehicle', entityId: id, action: 'update', before, after });
    res.json(after);
  });

  return router;
}

/** Drivers: name and phone only. Erasure (GDPR) is a separate endpoint. */
export function driversRouter({ db, audit }) {
  const router = Router();
  const stmtList = db.prepare(`
    SELECT * FROM drivers
    WHERE company_id = ? AND anonymized_at IS NULL AND (? = 1 OR active = 1)
    ORDER BY active DESC, name COLLATE NOCASE
  `);
  const stmtGet = db.prepare('SELECT * FROM drivers WHERE id = ? AND company_id = ? AND anonymized_at IS NULL');
  const stmtInsert = db.prepare(`
    INSERT INTO drivers (company_id, name, phone, active) VALUES (@company_id, @name, @phone, @active)
  `);

  router.get('/', (req, res) => {
    res.json(stmtList.all(req.companyId, req.query.all === '1' ? 1 : 0));
  });

  router.post('/', (req, res) => {
    const data = validate(driverCreate, req.body);
    const { lastInsertRowid } = stmtInsert.run({ company_id: req.companyId, active: 1, ...data });
    const created = stmtGet.get(lastInsertRowid, req.companyId);
    audit({ ...officeActor(req), entity: 'driver', entityId: created.id, action: 'create' });
    res.status(201).json(created);
  });

  router.patch('/:id', (req, res) => {
    const id = idParam(req.params.id);
    if (!stmtGet.get(id, req.companyId)) throw notFound('Föraren finns inte.');
    const data = validate(driverPatch, req.body);
    updateScoped(db, 'drivers', id, req.companyId, data);
    // Driver details are personal data: log which fields changed, not the values.
    audit({ ...officeActor(req), entity: 'driver', entityId: id, action: 'update', after: { fields: Object.keys(data) } });
    res.json(stmtGet.get(id, req.companyId));
  });

  return router;
}
