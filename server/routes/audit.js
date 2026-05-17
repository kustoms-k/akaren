import { Router } from 'express';
import db          from '../db.js';

const router = Router();

const stmtGet = db.prepare(`
  SELECT a.id, a.entity_type, a.entity_id, a.action,
         a.before_value, a.after_value, a.ip_address, a.created_at,
         u.name  AS user_name,
         u.email AS user_email,
         u.role  AS user_role
  FROM audit_log a
  LEFT JOIN users u ON u.id = a.user_id
  WHERE a.company_id = ?
    AND (? IS NULL OR a.entity_type = ?)
    AND (? IS NULL OR a.user_id     = ?)
    AND (? IS NULL OR a.created_at >= ?)
    AND (? IS NULL OR a.created_at <= ?)
  ORDER BY a.created_at DESC
  LIMIT ? OFFSET ?
`);

const stmtCount = db.prepare(`
  SELECT COUNT(*) AS total
  FROM audit_log a
  WHERE a.company_id = ?
    AND (? IS NULL OR a.entity_type = ?)
    AND (? IS NULL OR a.user_id     = ?)
    AND (? IS NULL OR a.created_at >= ?)
    AND (? IS NULL OR a.created_at <= ?)
`);

const stmtUsers = db.prepare(`SELECT id, name, email, role FROM users WHERE company_id = ?`);

// GET /api/audit?entity_type=&user_id=&date_from=&date_to=&limit=&offset=
router.get('/', (req, res) => {
  try {
    const { entity_type, user_id, date_from, date_to } = req.query;
    const lim = Math.min(Number(req.query.limit)  || 50, 200);
    const off = Number(req.query.offset) || 0;

    const et  = entity_type || null;
    const uid = user_id ? Number(user_id) : null;
    const df  = date_from || null;
    const dt  = date_to ? date_to + ' 23:59:59' : null;

    const rows = stmtGet.all(
      req.companyId, et, et, uid, uid, df, df, dt, dt, lim, off,
    );
    const { total } = stmtCount.get(
      req.companyId, et, et, uid, uid, df, df, dt, dt,
    );
    const users = stmtUsers.all(req.companyId);

    res.json({ rows, total, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/ai-extractions?quote_id=
router.get('/ai-extractions', (req, res) => {
  try {
    const { quote_id } = req.query;
    const rows = quote_id
      ? db.prepare(`SELECT * FROM ai_extractions WHERE company_id = ? AND quote_id = ? ORDER BY created_at DESC`).all(req.companyId, Number(quote_id))
      : db.prepare(`SELECT id, company_id, quote_id, system_prompt_version, model_used, confidence_scores, human_overrides, created_at FROM ai_extractions WHERE company_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.companyId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
