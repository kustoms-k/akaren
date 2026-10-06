import cron from 'node-cron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stockholmDate } from '../lib/dates.js';
import { photoPath } from '../services/photos.js';

const KEEP = 14;
const FILE_RE = /^akaren-\d{4}-\d{2}-\d{2}\.db$/;

function prune(dir) {
  const files = readdirSync(dir).filter((f) => FILE_RE.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(dir, f));
}

/**
 * Copy new photos to <mirror>/photos and remove the copies of photos the retention job deleted,
 * so a backup never keeps a photo longer than the retention period. Photo files never change
 * (the id is random per upload), so a file that already exists in the mirror is up to date.
 */
export function mirrorPhotos({ db, config }) {
  const target = join(config.backupMirrorDir, 'photos');
  const counts = { copied: 0, removed: 0 };
  for (const { id, deleted_at: deletedAt } of db.prepare('SELECT id, deleted_at FROM photos').iterate()) {
    const dest = photoPath(target, id);
    if (deletedAt) {
      if (existsSync(dest)) { rmSync(dest); counts.removed++; }
      continue;
    }
    const src = photoPath(config.photosDir, id);
    if (existsSync(dest) || !existsSync(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    counts.copied++;
  }
  return counts;
}

/**
 * Consistent snapshot of the live DB via VACUUM INTO, kept for 14 days in DATA_DIR/backups.
 * With BACKUP_DIR set (e.g. an external disk), the snapshot and the photos are mirrored there too.
 * Photos aren't copied within DATA_DIR: a copy on the same disk protects against nothing.
 */
export function runBackup({ db, config, logger = console }) {
  mkdirSync(config.backupsDir, { recursive: true });
  const name = `akaren-${stockholmDate()}.db`;
  const target = join(config.backupsDir, name);
  if (existsSync(target)) rmSync(target);
  db.prepare('VACUUM INTO ?').run(target);
  prune(config.backupsDir);

  let photos = null;
  if (config.backupMirrorDir) {
    mkdirSync(config.backupMirrorDir, { recursive: true });
    copyFileSync(target, join(config.backupMirrorDir, name));
    prune(config.backupMirrorDir);
    photos = mirrorPhotos({ db, config });
  }
  logger.log(`[backup] wrote ${target}${photos ? ` (+ mirror, photos: ${photos.copied} copied, ${photos.removed} removed)` : ''}`);
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
