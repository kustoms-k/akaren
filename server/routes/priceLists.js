import { Router } from 'express';
import { z } from 'zod';
import { conflict, idParam, notFound, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { optionalText, requiredText } from '../lib/schemas.js';
import { UNITS } from '../lib/pricing.js';
import { UPPDRAGSTYPER } from '../lib/orderExtraction.js';

const listSchema = z.object({ name: requiredText(120), is_default: z.boolean().optional() }).strict();
const itemSchema = z.object({
  uppdragstyp: z.preprocess((v) => (v === '' ? null : v), z.enum(UPPDRAGSTYPER, { error: 'Ogiltig uppdragstyp.' }).nullable()),
  material: optionalText(120),
  unit: z.enum(UNITS, { error: 'Välj enhet.' }),
  price_ore: z.coerce.number({ error: 'Ange ett pris.' }).int('Ange priset i hela ören.').min(0, 'Priset kan inte vara negativt.').max(100_000_000),
}).strict();

/**
 * Price lists (/api/price-lists). Prices are öre ex VAT. Resolution for the fakturaunderlag (lib/pricing.js):
 * project list → customer list → the company default; the most specific item wins.
 * Changing a price only affects work that isn't invoiced yet; invoice lines keep their own price.
 */
export function priceListsRouter({ db, audit }) {
  const router = Router();
  const stmt = {
    lists: db.prepare(`
      SELECT l.id, l.name, l.is_default, l.created_at,
             (SELECT COUNT(*) FROM customers c WHERE c.price_list_id = l.id) AS customer_count,
             (SELECT COUNT(*) FROM projects p WHERE p.price_list_id = l.id) AS project_count
      FROM price_lists l WHERE l.company_id = ? ORDER BY l.is_default DESC, l.name`),
    items: db.prepare(`
      SELECT i.id, i.price_list_id, i.uppdragstyp, i.material, i.unit, i.price_ore FROM price_list_items i
      JOIN price_lists l ON l.id = i.price_list_id WHERE l.company_id = ?
      ORDER BY i.uppdragstyp IS NULL, i.uppdragstyp, i.material IS NOT NULL, i.material, i.id`),
    list: db.prepare('SELECT * FROM price_lists WHERE id = ? AND company_id = ?'),
    item: db.prepare('SELECT * FROM price_list_items WHERE id = ? AND price_list_id = ?'),
    insert: db.prepare('INSERT INTO price_lists (company_id, name, is_default) VALUES (?, ?, 0)'),
    rename: db.prepare('UPDATE price_lists SET name = ? WHERE id = ?'),
    clearDefault: db.prepare('UPDATE price_lists SET is_default = 0 WHERE company_id = ?'),
    setDefault: db.prepare('UPDATE price_lists SET is_default = 1 WHERE id = ?'),
    delete: db.prepare('DELETE FROM price_lists WHERE id = ?'),
    insertItem: db.prepare('INSERT INTO price_list_items (price_list_id, uppdragstyp, material, unit, price_ore) VALUES (@list, @uppdragstyp, @material, @unit, @price_ore)'),
    updateItem: db.prepare('UPDATE price_list_items SET uppdragstyp = @uppdragstyp, material = @material, unit = @unit, price_ore = @price_ore WHERE id = @id'),
    deleteItem: db.prepare('DELETE FROM price_list_items WHERE id = ?'),
  };

  function all(companyId) {
    const lists = stmt.lists.all(companyId).map((l) => ({ ...l, is_default: Boolean(l.is_default), items: [] }));
    const byId = new Map(lists.map((l) => [l.id, l]));
    for (const it of stmt.items.all(companyId)) byId.get(it.price_list_id)?.items.push(it);
    return lists;
  }
  function loadList(req) {
    const list = stmt.list.get(idParam(req.params.id), req.companyId);
    if (!list) throw notFound('Prislistan finns inte.');
    return list;
  }
  function loadItem(req, list) {
    const item = stmt.item.get(idParam(req.params.itemId), list.id);
    if (!item) throw notFound('Raden finns inte.');
    return item;
  }

  router.get('/', (req, res) => res.json(all(req.companyId)));

  router.post('/', (req, res) => {
    const { name, is_default: isDefault } = validate(listSchema, req.body);
    const id = db.transaction(() => {
      const newId = Number(stmt.insert.run(req.companyId, name).lastInsertRowid);
      if (isDefault) { stmt.clearDefault.run(req.companyId); stmt.setDefault.run(newId); }
      return newId;
    })();
    audit({ ...officeActor(req), entity: 'price_list', entityId: id, action: 'create', after: { name, is_default: Boolean(isDefault) } });
    res.status(201).json(all(req.companyId).find((l) => l.id === id));
  });

  router.patch('/:id', (req, res) => {
    const list = loadList(req);
    const data = validate(listSchema.partial(), req.body);
    db.transaction(() => {
      if (data.name) stmt.rename.run(data.name, list.id);
      if (data.is_default === true) { stmt.clearDefault.run(req.companyId); stmt.setDefault.run(list.id); }
      if (data.is_default === false && list.is_default) throw conflict('needs_default', 'Välj en annan prislista som standard i stället.');
    })();
    audit({ ...officeActor(req), entity: 'price_list', entityId: list.id, action: 'update', before: { name: list.name, is_default: Boolean(list.is_default) }, after: data });
    res.json(all(req.companyId).find((l) => l.id === list.id));
  });

  router.delete('/:id', (req, res) => {
    const list = loadList(req);
    const full = all(req.companyId).find((l) => l.id === list.id);
    if (list.is_default) throw conflict('is_default', 'Standardprislistan kan inte tas bort.');
    if (full.customer_count || full.project_count) throw conflict('in_use', 'Prislistan används av kunder eller projekt. Byt prislista på dem först.');
    stmt.delete.run(list.id);
    audit({ ...officeActor(req), entity: 'price_list', entityId: list.id, action: 'delete', before: { name: list.name } });
    res.json({ ok: true });
  });

  router.post('/:id/items', (req, res) => {
    const list = loadList(req);
    const data = validate(itemSchema, req.body);
    const id = Number(stmt.insertItem.run({ list: list.id, ...data, material: data.material ?? null }).lastInsertRowid);
    audit({ ...officeActor(req), entity: 'price_list_item', entityId: id, action: 'create', after: { price_list_id: list.id, ...data } });
    res.status(201).json(stmt.item.get(id, list.id));
  });

  router.patch('/:id/items/:itemId', (req, res) => {
    const list = loadList(req);
    const item = loadItem(req, list);
    const data = validate(itemSchema.partial(), req.body);
    const next = { ...item, ...data, material: data.material !== undefined ? data.material ?? null : item.material };
    stmt.updateItem.run({ id: item.id, uppdragstyp: next.uppdragstyp, material: next.material, unit: next.unit, price_ore: next.price_ore });
    audit({ ...officeActor(req), entity: 'price_list_item', entityId: item.id, action: 'update', before: item, after: next });
    res.json(stmt.item.get(item.id, list.id));
  });

  router.delete('/:id/items/:itemId', (req, res) => {
    const list = loadList(req);
    const item = loadItem(req, list);
    stmt.deleteItem.run(item.id);
    audit({ ...officeActor(req), entity: 'price_list_item', entityId: item.id, action: 'delete', before: item });
    res.json({ ok: true });
  });

  return router;
}
