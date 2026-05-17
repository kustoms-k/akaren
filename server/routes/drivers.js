import { Router }    from 'express';
import db             from '../db.js';
import { smsEnabled } from '../sms.js';

const router = Router();

const stmtAll    = db.prepare('SELECT id, name, phone, truck_id FROM drivers WHERE company_id = ? ORDER BY truck_id');
const stmtUpdate = db.prepare('UPDATE drivers SET name = ?, phone = ? WHERE id = ? AND company_id = ?');

router.get('/sms-status', (_req, res) => {
  res.json({ enabled: smsEnabled });
});

router.get('/', (req, res) => {
  try {
    res.json(stmtAll.all(req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const { name, phone } = req.body;
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'name och phone krävs' });
  }
  try {
    const result = stmtUpdate.run(name.trim(), phone.trim(), Number(req.params.id), req.companyId);
    if (result.changes === 0) return res.status(404).json({ error: 'Förare hittades inte.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
