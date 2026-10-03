// Usage: npm run seed [-- --reset]
// Seeds "Teståkeriet AB" into DATA_DIR/akaren.db with rendered demo vågsedel photos.
// --reset deletes the database and the photo folder first.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { loadConfig } from '../config.js';
import { openDb, migrate } from '../db/index.js';
import { stockholmDate } from '../lib/dates.js';
import { seedDemo } from './demo.js';
import { renderVagsedel } from './vagsedelImage.js';

/** Render the demo tickets and fill in the placeholder photo rows created by seedDemo. */
async function renderDemoPhotos(db, photosDir, photos) {
  const update = db.prepare('UPDATE photos SET sha256 = ?, bytes = ?, width = ?, height = ? WHERE id = ?');
  for (const p of photos) {
    const jpeg = await renderVagsedel(p.slip, { blur: p.blur });
    const { width, height } = await sharp(jpeg).metadata();
    mkdirSync(join(photosDir, p.id.slice(0, 2)), { recursive: true });
    writeFileSync(join(photosDir, p.id.slice(0, 2), `${p.id}.jpg`), jpeg, { mode: 0o600 });
    update.run(createHash('sha256').update(jpeg).digest('hex'), jpeg.length, width, height, p.id);
  }
}

const config = loadConfig();

if (process.argv.includes('--reset')) {
  if (config.isProd) {
    console.error('[seed] Refusing to --reset with NODE_ENV=production.');
    process.exit(1);
  }
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(config.dbFile + suffix)) rmSync(config.dbFile + suffix);
  }
  rmSync(config.photosDir, { recursive: true, force: true });
}

const db = openDb(config.dbFile);
migrate(db);

const password = process.env.SEED_PASSWORD || randomBytes(6).toString('base64url');
try {
  const s = seedDemo(db, { today: stockholmDate(), password, withPhotos: true });
  await renderDemoPhotos(db, config.photosDir, s.photos);
  console.log(`[seed] Teståkeriet AB seeded into ${config.dbFile}`);
  console.log(`[seed] ${s.vehicles} fordon, ${s.drivers} förare, ${s.customers} kunder, ${s.projects} projekt`);
  console.log(`[seed] ${s.lass} lass (${s.versions} versioner, ${s.photos.length} vågsedelfoton), ${s.timeEntries} tidrapporter, veckor ${s.previousWeek} + ${s.currentWeek}`);
  console.log(`[seed] Logga in: ${s.email} / ${password}${process.env.SEED_PASSWORD ? ' (från SEED_PASSWORD)' : ''}`);
} catch (err) {
  if (err.message === 'Database already contains data') {
    console.error('[seed] The database already contains data. Run `npm run seed -- --reset` to start over.');
    process.exit(1);
  }
  throw err;
} finally {
  db.close();
}
