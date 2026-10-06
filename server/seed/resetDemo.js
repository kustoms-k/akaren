import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { stockholmDate } from '../lib/dates.js';
import { seedDemo } from './demo.js';
import { renderDemoPhotos } from './demoPhotos.js';

/**
 * Wipe every table and the photo folder, then seed fresh demo data dated around today. DEMO_MODE only: callers
 * check config.demoMode, and the config refuses DEMO_MODE in production. Returns the seed summary.
 */
export async function resetDemo({ db, config, audit = null, logger = console }) {
  if (!config.demoMode) throw new Error('resetDemo needs DEMO_MODE=1');
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('schema_migrations') AND name NOT LIKE 'sqlite_%'`).pluck().all();
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => { for (const t of tables) db.prepare(`DELETE FROM "${t}"`).run(); })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  rmSync(config.photosDir, { recursive: true, force: true });
  const s = seedDemo(db, { today: stockholmDate(), password: randomBytes(12).toString('base64url'), withPhotos: true });
  await renderDemoPhotos(db, config.photosDir, s.photos);
  const companyId = db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').pluck().get();
  audit?.({ companyId, actorKind: 'system', entity: 'demo', action: 'reset', after: { lass: s.lass, weeks: [s.previousWeek, s.currentWeek] } });
  logger.log(`[demo] reset: ${s.lass} lass, weeks ${s.previousWeek} + ${s.currentWeek}`);
  return s;
}
