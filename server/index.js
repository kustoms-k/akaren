import { loadConfig } from './config.js';
import { openDb, migrate } from './db/index.js';
import { createApp } from './app.js';
import { scheduleBackups } from './jobs/backup.js';
import { scheduleRetention } from './jobs/retention.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`[config] ${err.message}\n\nCopy server/.env.example to server/.env and fill it in.`);
  process.exit(1);
}

const db = openDb(config.dbFile);
const applied = migrate(db);
if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);

const app = createApp({ config, db });
const server = app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
  console.log(`[server] office UI: ${config.appUrl}  ·  driver links: ${config.publicBaseUrl}`);
  if (!config.elks.enabled) console.log('[server] 46elks not configured: SMS is simulated');
  if (!config.anthropic.apiKey) console.log('[server] ANTHROPIC_API_KEY missing: AI extraction disabled');
  if (!config.fortnox.configured) console.log('[server] FORTNOX_* missing: Fortnox disabled');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const hint = process.platform === 'win32'
      ? `find it with \`netstat -ano | findstr :${config.port}\`, then \`taskkill /PID <pid> /F\``
      : `kill $(lsof -ti:${config.port})`;
    console.error(`[server] Port ${config.port} is already in use. Stop the other process: ${hint}`);
    process.exit(1);
  }
  throw err;
});

scheduleRetention({ db, config });
scheduleBackups({ db, config });

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
