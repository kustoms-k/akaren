import db from '../db.js';

// ── Entity type → DB table (for before-state capture) ────────────────────────
const ENTITY_TABLE = {
  quote:           'quotes',
  job:             'jobs',
  fleet:           'company_fleet',
  driver:          'drivers',
  invoice:         'invoices',
  template:        'templates',
  customer:        'customers',
  customer_portal: 'customer_portals',
};

const stmtInsert   = db.prepare(`
  INSERT INTO audit_log
    (company_id, user_id, user_name, entity_type, entity_id, action,
     before_value, after_value, ip_address)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtUserName = db.prepare('SELECT name FROM users WHERE id = ?');

function getUserName(userId) {
  if (!userId) return null;
  try { return stmtUserName.get(userId)?.name ?? null; } catch { return null; }
}

function fetchBefore(entityType, entityId, companyId) {
  const table = ENTITY_TABLE[entityType];
  if (!table || !entityId) return null;
  try {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`)
             .get(Number(entityId), companyId) ?? null;
  } catch { return null; }
}

export function writeAudit({ companyId, userId, userName, entityType, entityId, action, before, after, ip }) {
  try {
    stmtInsert.run(
      companyId,
      userId ?? null,
      userName ?? getUserName(userId),
      entityType,
      entityId != null ? String(entityId) : null,
      action,
      before != null ? (typeof before === 'string' ? before : JSON.stringify(before)) : null,
      after  != null ? (typeof after  === 'string' ? after  : JSON.stringify(after))  : null,
      ip ?? null,
    );
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

// ── Intercepts mutations: captures before+after, writes audit event ──────────
export function auditMutation(entityType) {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || !req.user) return next();

    // Capture before-state for updates and deletes
    let before = null;
    if (['PATCH', 'PUT', 'DELETE'].includes(method) && req.params.id) {
      before = fetchBefore(entityType, req.params.id, req.companyId);
    }

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const isRoot = req.path === '/';
        const action = method === 'DELETE'           ? 'delete'
                     : (method === 'POST' && isRoot) ? 'create'
                     : 'update';
        writeAudit({
          companyId:  req.companyId,
          userId:     req.user.userId,
          entityType,
          entityId:   body?.rawId ?? body?.id ?? req.params.id ?? null,
          action,
          before:     action !== 'create' ? before : null,
          after:      action !== 'delete' ? body   : (before ?? body),
          ip:         req.ip,
        });
      }
      return originalJson.call(this, body);
    };
    next();
  };
}

// ── Intercepts sensitive GETs and writes a 'view' event ─────────────────────
export function auditView(entityType) {
  return (req, res, next) => {
    if (req.method.toUpperCase() !== 'GET' || !req.user) return next();

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        writeAudit({
          companyId: req.companyId,
          userId:    req.user.userId,
          entityType,
          entityId:  req.params.id ?? null,
          action:    'view',
          ip:        req.ip,
        });
      }
      return originalJson.call(this, body);
    };
    next();
  };
}
