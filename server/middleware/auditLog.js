import db from '../db.js';

const stmtInsert = db.prepare(`
  INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, before_value, after_value, ip_address)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function writeAudit({ companyId, userId, entityType, entityId, action, before, after, ip }) {
  try {
    stmtInsert.run(
      companyId,
      userId ?? null,
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

// Intercepts POST/PATCH/PUT/DELETE responses and writes a mutation event.
// POST to root path → 'create'; all others → 'update'; DELETE → 'delete'.
export function auditMutation(entityType) {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || !req.user) return next();

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const isRoot  = req.path === '/';
        const action  = method === 'DELETE' ? 'delete'
                      : (method === 'POST' && isRoot) ? 'create'
                      : 'update';
        writeAudit({
          companyId:  req.companyId,
          userId:     req.user.userId,
          entityType,
          entityId:   body?.rawId ?? body?.id ?? req.params.id ?? null,
          action,
          after:      action !== 'delete' ? body : null,
          ip:         req.ip,
        });
      }
      return originalJson.call(this, body);
    };
    next();
  };
}

// Intercepts successful GET responses on sensitive routes and writes a 'view' event.
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
