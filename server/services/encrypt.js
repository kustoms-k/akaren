import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

/** AES-256-GCM helpers for secrets stored in the DB (e.g. Fortnox tokens). */
export function createCrypto(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Encryption key must be 32 bytes');

  function encrypt(text) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
  }

  function decrypt(stored) {
    if (!stored) return null;
    try {
      const [ivHex, tagHex, encHex] = stored.split(':');
      const dec = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
      dec.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([dec.update(Buffer.from(encHex, 'hex')), dec.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  return { encrypt, decrypt };
}
