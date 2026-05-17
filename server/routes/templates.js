import { Router } from 'express';
import db          from '../db.js';

const router = Router();

const stmtAll    = db.prepare('SELECT * FROM templates WHERE company_id = ? ORDER BY created_at DESC');
const stmtInsert = db.prepare(`
  INSERT INTO templates (company_id, name, lasttyp, upphämtning, leverans, fordon_id, base_price_sek)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtDelete = db.prepare('DELETE FROM templates WHERE id = ? AND company_id = ?');

router.get('/', (req, res) => {
  try {
    res.json(stmtAll.all(req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { name, lasttyp, upphämtning, leverans, fordon_id, base_price_sek } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name saknas' });
  try {
    const result = stmtInsert.run(
      req.companyId,
      name.trim(),
      lasttyp        ?? null,
      upphämtning    ?? null,
      leverans       ?? null,
      fordon_id      ?? null,
      base_price_sek ?? null,
    );
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    stmtDelete.run(Number(req.params.id), req.companyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
