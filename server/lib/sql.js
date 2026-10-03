/**
 * UPDATE `table` SET <keys of data> for one row scoped to a company.
 * Column names come from validated (strict zod) objects, never from raw input.
 * Returns the number of changed rows.
 */
export function updateScoped(db, table, id, companyId, data, { touchUpdatedAt = false } = {}) {
  const keys = Object.keys(data);
  if (keys.length === 0) return 0;
  const sets = keys.map((k) => `${k} = @${k}`);
  if (touchUpdatedAt) sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  return db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = @__id AND company_id = @__cid`)
    .run({ ...data, __id: id, __cid: companyId }).changes;
}

/** True when a better-sqlite3 error is a UNIQUE constraint violation. */
export const isUniqueViolation = (err) => err?.code === 'SQLITE_CONSTRAINT_UNIQUE';
