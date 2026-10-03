// Usage: npm run seed [-- --reset]
// Seeds "Teståkeriet AB" into DATA_DIR/akaren.db. --reset deletes the database first.
import { existsSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';
import { openDb, migrate } from '../db/index.js';
import { stockholmDate } from '../lib/dates.js';
import { seedDemo } from './demo.js';

const config = loadConfig();
const reset = process.argv.includes('--reset');

if (reset) {
  if (config.isProd) {
    console.error('[seed] Refusing to --reset with NODE_ENV=production.');
    process.exit(1);
  }
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(config.dbFile + suffix)) rmSync(config.dbFile + suffix);
  }
}

const db = openDb(config.dbFile);
migrate(db);

const password = process.env.SEED_PASSWORD || randomBytes(6).toString('base64url');
try {
  const s = seedDemo(db, { today: stockholmDate(), password });
  console.log(`[seed] Teståkeriet AB seeded into ${config.dbFile}`);
  console.log(`[seed] ${s.vehicles} fordon, ${s.drivers} förare, ${s.customers} kunder, ${s.projects} projekt`);
  console.log(`[seed] ${s.lass} lass (${s.versions} versioner), ${s.timeEntries} tidrapporter, veckor ${s.previousWeek} + ${s.currentWeek}`);
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
