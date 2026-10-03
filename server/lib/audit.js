const toJson = (v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));

/** Returns a writer bound to `db`. Audit failures are logged, never thrown. */
export function createAudit(db, logger = console) {
  const insert = db.prepare(`
    INSERT INTO audit_log (company_id, actor_kind, actor_id, entity, entity_id, action, before_json, after_json, ip)
    VALUES (@companyId, @actorKind, @actorId, @entity, @entityId, @action, @before, @after, @ip)
  `);

  return function audit({ companyId, actorKind, actorId = null, entity, entityId = null, action, before = null, after = null, ip = null }) {
    try {
      insert.run({
        companyId, actorKind, actorId, entity,
        entityId: entityId == null ? null : String(entityId),
        action, before: toJson(before), after: toJson(after), ip,
      });
    } catch (err) {
      logger.error('[audit] write failed:', err.message);
    }
  };
}

/** Audit fields for a request made by an office user. */
export const officeActor = (req) => ({
  companyId: req.companyId, actorKind: 'office', actorId: req.user.id, ip: req.ip,
});
