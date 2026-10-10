import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { stockholmDate } from '../lib/dates.js';
import { seedDemo } from './demo.js';
import { renderDemoPhotos } from './demoPhotos.js';

// Each reset bumps the generation, so the background rendering of an older reset stops.
let generation = 0;

/**
 * Wipe every table and the photo folder, then seed fresh demo data dated around today: the whole company unless
 * DEMO_FULL=0. DEMO_MODE only: callers check config.demoMode, and the config refuses DEMO_MODE in production.
 * The photos the demo shows first (today's loads and those waiting for review) are rendered before this returns;
 * the rest render after it, newest first, unless `waitForPhotos`. Returns the seed summary.
 */
export async function resetDemo({ db, config, audit = null, logger = console, waitForPhotos = true }) {
  if (!config.demoMode) throw new Error('resetDemo needs DEMO_MODE=1');
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('schema_migrations') AND name NOT LIKE 'sqlite_%'`).pluck().all();
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => { for (const t of tables) db.prepare(`DELETE FROM "${t}"`).run(); })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  rmSync(config.photosDir, { recursive: true, force: true });
  const mine = ++generation;
  const s = seedDemo(db, { today: stockholmDate(), password: randomBytes(12).toString('base64url'), withPhotos: true, full: config.demoFull });
  const later = s.photos.filter((p) => !p.urgent).sort((a, b) => b.slip.datum.localeCompare(a.slip.datum));
  await renderDemoPhotos(db, config.photosDir, s.photos.filter((p) => p.urgent));
  const rest = renderDemoPhotos(db, config.photosDir, later, { stopped: () => generation !== mine })
    .catch((err) => logger.error('[demo] rendering the older vågsedel photos failed:', err));
  if (waitForPhotos) await rest;
  const companyId = db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').pluck().get();
  audit?.({ companyId, actorKind: 'system', entity: 'demo', action: 'reset', after: { lass: s.lass, weeks: [s.previousWeek, s.currentWeek] } });
  logger.log(`[demo] reset: ${s.lass} lass, weeks ${s.previousWeek} + ${s.currentWeek}`);
  return s;
}
