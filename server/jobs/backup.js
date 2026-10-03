import cron from 'node-cron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stockholmDate } from '../lib/dates.js';

const KEEP = 14;
const FILE_RE = /^akaren-\d{4}-\d{2}-\d{2}\.db$/;

function prune(dir) {
  const files = readdirSync(dir).filter((f) => FILE_RE.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(dir, f));
}

/**
 * Consistent snapshot of the live DB via VACUUM INTO, kept for 14 days in DATA_DIR/backups
 * and optionally mirrored to BACKUP_DIR (e.g. an external disk). Photos are mirrored
 * once the photo store exists.
 */
export function runBackup({ db, config, logger = console }) {
  mkdirSync(config.backupsDir, { recursive: true });
  const name = `akaren-${stockholmDate()}.db`;
  const target = join(config.backupsDir, name);
  if (existsSync(target)) rmSync(target);
  db.prepare('VACUUM INTO ?').run(target);
  prune(config.backupsDir);

  if (config.backupMirrorDir) {
    mkdirSync(config.backupMirrorDir, { recursive: true });
    copyFileSync(target, join(config.backupMirrorDir, name));
    prune(config.backupMirrorDir);
  }
  logger.log(`[backup] wrote ${target}${config.backupMirrorDir ? ' (+ mirror)' : ''}`);
  return target;
}

export function scheduleBackups(deps) {
  return cron.schedule('0 2 * * *', () => {
    try {
      runBackup(deps);
    } catch (err) {
      (deps.logger ?? console).error('[backup] failed:', err.message);
    }
  }, { timezone: 'Europe/Stockholm' });
}
