// Usage: npm run seed [-- --reset]
// Seeds "Lagerviks Åkeri AB" into DATA_DIR/akaren.db with rendered demo vågsedel photos.
// --reset deletes the database and the photo folder first.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { openDb, migrate } from '../db/index.js';
import { stockholmDate } from '../lib/dates.js';
import { seedDemo } from './demo.js';
import { renderDemoPhotos } from './demoPhotos.js';
import { ekbackaListText, invoiceSpecText, skogsasListText } from './weighList.js';

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
  const s = seedDemo(db, { today: stockholmDate(), password, withPhotos: true, full: config.demoFull });
  await renderDemoPhotos(db, config.photosDir, s.photos);
  console.log(`[seed] Lagerviks Åkeri AB seeded into ${config.dbFile}`);
  console.log(`[seed] ${s.vehicles} fordon, ${s.drivers} förare, ${s.customers} kunder, ${s.projects} projekt`);
  console.log(`[seed] ${s.lass} lass (${s.versions} versioner, ${s.photos.length} vågsedelfoton), ${s.timeEntries} tidrapporter, veckor ${s.previousWeek} + ${s.currentWeek}`);
  if (s.full) {
    const f = s.full;
    console.log(`[seed] Historik ${f.history_weeks.join(' + ')}: ${f.invoiced.batches} fakturerade underlag (${f.invoiced.fortnox} Fortnox-utkast), ${f.found.lists} våglistor avstämda, ${f.hazard_reports} farligt avfall rapporterat`);
  }
  if (s.weighList) console.log(`[seed] Avstämning: våglista från Ekbacka för ${s.previousWeek} importerad (${s.weighList.rows} vägningar)`);
  // A second facility's list to try the import with (Avstämning → Importera våglista → Välj fil).
  const companyId = db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').pluck().get();
  const sample = join(config.dataDir, 'exempel-vaglista-skogsas.txt');
  writeFileSync(sample, skogsasListText(db, { companyId, week: s.previousWeek }));
  writeFileSync(join(config.dataDir, 'exempel-vaglista-ekbacka.csv'), ekbackaListText(db, { companyId, week: s.previousWeek }));
  writeFileSync(join(config.dataDir, 'exempel-fakturaspecifikation.csv'), invoiceSpecText(db, { companyId, week: s.previousWeek }));
  console.log(`[seed] Exempelfiler i ${config.dataDir}: exempel-vaglista-skogsas.txt (Avstämning), exempel-vaglista-ekbacka.csv + exempel-fakturaspecifikation.csv (Förlustkontroll)`);
  if (s.inbox) console.log(`[seed] Inkorg order@lagerviksakeri.se: ${s.inbox.emails} mejl, ${s.inbox.replies} svar, ${s.inbox.pool} väntar på "Hämta ny post"`);
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
