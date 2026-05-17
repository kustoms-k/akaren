import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';
import { existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import cron from 'node-cron';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, '../data/kemoffs.db');
const TMP_DIR   = path.join(__dirname, '../data');

// ── S3 client (S3-compatible: AWS, R2, Backblaze, MinIO) ─────────────────────
function getS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const region   = process.env.S3_REGION ?? 'auto';
  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY || !process.env.S3_BUCKET) {
    return null;
  }
  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId:     process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });
}

// ── Encryption helpers ────────────────────────────────────────────────────────
// Master key: 64 hex chars = 32 bytes in env BACKUP_ENCRYPTION_KEY
// Per-backup key: HMAC-SHA256(master, `backup-${timestamp}`) → unique each run
function getMasterKey() {
  const hex = process.env.BACKUP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext, masterKey) {
  // Derive a unique key per backup from a random salt
  const salt = randomBytes(32);
  const key  = createHmac('sha256', masterKey).update(salt).digest();
  const iv   = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct   = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag  = cipher.getAuthTag();
  // Layout: salt(32) + iv(16) + tag(16) + ciphertext
  return Buffer.concat([salt, iv, tag, ct]);
}

export function decrypt(payload, masterKey) {
  const salt = payload.subarray(0, 32);
  const iv   = payload.subarray(32, 48);
  const tag  = payload.subarray(48, 64);
  const ct   = payload.subarray(64);
  const key  = createHmac('sha256', masterKey).update(salt).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ── Core backup routine ───────────────────────────────────────────────────────
async function runBackup(backupType = 'daily') {
  const s3     = getS3();
  const master = getMasterKey();
  const bucket = process.env.S3_BUCKET;
  const ts     = new Date().toISOString().replace(/[:.]/g, '-');

  let s3Key   = null;
  let status  = 'ok';
  let errorMsg = null;
  let sizeBytes = null;

  try {
    // 1. Flush WAL then take a clean snapshot via VACUUM INTO
    const snapPath = path.join(TMP_DIR, `snap-${ts}.db`);
    db.exec(`VACUUM INTO '${snapPath}'`);

    // 2. Read snapshot
    let payload = await readFile(snapPath);
    sizeBytes   = payload.length;

    // 3. Encrypt if key is configured
    if (master) {
      payload = encrypt(payload, master);
    }

    // 4. Upload to S3 if configured
    if (s3 && bucket) {
      s3Key = `backups/${backupType}/${ts}.db${master ? '.enc' : ''}`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key:    s3Key,
        Body:   payload,
        ContentType: 'application/octet-stream',
        Metadata: {
          backup_type: backupType,
          created_at:  new Date().toISOString(),
          encrypted:   master ? 'aes-256-gcm' : 'none',
        },
      }));
    } else {
      console.warn('[backup] No S3 configured — backup not uploaded.');
    }

    // 5. Clean up temp snapshot
    await unlink(snapPath).catch(() => {});

    console.log(`[backup] ${backupType} backup complete → ${s3Key ?? '(local only)'} (${Math.round(sizeBytes / 1024)} KB)`);
  } catch (err) {
    status   = 'failed';
    errorMsg = err.message;
    console.error('[backup] Failed:', err.message);
  }

  // 6. Record in backups table
  try {
    db.prepare(`
      INSERT INTO backups (backup_type, s3_key, size_bytes, encrypted, status, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(backupType, s3Key, sizeBytes, master ? 1 : 0, status, errorMsg ?? null);
  } catch (e) {
    console.error('[backup] Failed to record backup:', e.message);
  }

  // 7. Enforce retention: 30 daily, 12 monthly
  enforceRetention(backupType, s3);
}

// ── Retention cleanup ─────────────────────────────────────────────────────────
async function enforceRetention(type, s3) {
  const limit = type === 'daily' ? 30 : 12;
  const rows  = db.prepare(`
    SELECT id, s3_key FROM backups
    WHERE backup_type = ? AND status = 'ok'
    ORDER BY created_at DESC
  `).all(type);

  const toDelete = rows.slice(limit);
  for (const row of toDelete) {
    if (s3 && row.s3_key && process.env.S3_BUCKET) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: row.s3_key }));
      } catch { /* non-fatal */ }
    }
    db.prepare('DELETE FROM backups WHERE id = ?').run(row.id);
  }
}

// ── Restore from S3 ───────────────────────────────────────────────────────────
export async function restoreBackup(backupId) {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
  if (!backup) throw new Error('Backup not found');
  if (!backup.s3_key) throw new Error('No S3 key — backup was not uploaded');

  const s3     = getS3();
  const master = getMasterKey();
  if (!s3) throw new Error('S3 not configured');

  const resp = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key:    backup.s3_key,
  }));

  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  let payload = Buffer.concat(chunks);

  if (backup.encrypted && master) {
    payload = decrypt(payload, master);
  }

  // Write to pending-restore.db — applied on next server restart
  const pendingPath = path.join(TMP_DIR, 'pending-restore.db');
  await writeFile(pendingPath, payload);

  return pendingPath;
}

// ── Apply pending restore (called at server startup, before db opens) ────────
export function applyPendingRestore() {
  const pendingPath = path.join(TMP_DIR, 'pending-restore.db');
  if (!existsSync(pendingPath)) return;
  try {
    const safetyPath = path.join(TMP_DIR, `pre-restore-${Date.now()}.db`);
    copyFileSync(DB_PATH, safetyPath);
    copyFileSync(pendingPath, DB_PATH);
    unlinkSync(pendingPath);
    console.log('[backup] Pending restore applied. Previous DB saved as', safetyPath);
  } catch (err) {
    console.error('[backup] Failed to apply pending restore:', err.message);
  }
}

// ── Schedule: 02:00 Stockholm daily ──────────────────────────────────────────
export function scheduleDailyBackup() {
  // 02:00 Europe/Stockholm every day
  cron.schedule('0 2 * * *', () => {
    const isFirstOfMonth = new Date().getDate() === 1;
    runBackup('daily');
    if (isFirstOfMonth) runBackup('monthly');
  }, { timezone: 'Europe/Stockholm' });

  console.log('[backup] Scheduled daily backup at 02:00 Europe/Stockholm');
}

export { runBackup };
