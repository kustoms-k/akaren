import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && hex.length === 64) return Buffer.from(hex, 'hex');
  // Dev fallback: pad JWT_SECRET to 32 bytes
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
  const buf = Buffer.alloc(32, 0);
  Buffer.from(secret).copy(buf);
  return buf;
}

export function encrypt(text) {
  const key    = getKey();
  const iv     = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(stored) {
  if (!stored) return null;
  try {
    const parts = stored.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, encHex] = parts;
    const key = getKey();
    const dec = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    dec.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([dec.update(Buffer.from(encHex, 'hex')), dec.final()]).toString('utf8');
  } catch {
    return null;
  }
}
