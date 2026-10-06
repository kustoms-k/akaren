import sharp from 'sharp';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError } from '../lib/http.js';

const MAX_EDGE = 2000;
const ID_RE = /^[0-9a-f]{32}$/;

/** Where a photo lives under a photos directory: <dir>/ab/<id>.jpg. Also used by the backup and retention jobs. */
export const photoPath = (dir, id) => join(dir, id.slice(0, 2), `${id}.jpg`);

/**
 * Photo store on the local disk (DATA_DIR/photos/ab/<id>.jpg).
 * Every upload is re-encoded: auto-rotated, at most 2000 px, JPEG, with all metadata
 * (EXIF incl. GPS position) stripped. Ids are 128-bit random, so file names can't be guessed.
 */
export function createPhotoStore({ db, config }) {
  const dir = config.photosDir;

  const stmtInsert = db.prepare(`
    INSERT INTO photos (id, company_id, sha256, bytes, width, height, uploaded_by_driver_id, uploaded_by_user_id)
    VALUES (@id, @company_id, @sha256, @bytes, @width, @height, @driver_id, @user_id)
  `);
  const stmtGet = db.prepare('SELECT * FROM photos WHERE id = ? AND company_id = ? AND deleted_at IS NULL');
  const stmtBySha = db.prepare(`
    SELECT * FROM photos
    WHERE company_id = @company_id AND sha256 = @sha256 AND deleted_at IS NULL
      AND COALESCE(uploaded_by_driver_id, -1) = COALESCE(@driver_id, -1)
      AND COALESCE(uploaded_by_user_id, -1) = COALESCE(@user_id, -1)
  `);

  const pathFor = (id) => photoPath(dir, id);

  async function normalize(buffer) {
    try {
      return await sharp(buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new HttpError(400, 'invalid_image', 'Bilden kunde inte läsas. Ta om bilden.');
    }
  }

  /** Save an uploaded image. Returns { photo, jpeg, duplicate } — duplicate=true for a retried upload. */
  async function save(buffer, { companyId, driverId = null, userId = null }) {
    const { data, info } = await normalize(buffer);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const existing = stmtBySha.get({ company_id: companyId, sha256, driver_id: driverId, user_id: userId });
    if (existing && existsSync(pathFor(existing.id))) return { photo: existing, jpeg: data, duplicate: true };

    const id = randomBytes(16).toString('hex');
    mkdirSync(join(dir, id.slice(0, 2)), { recursive: true });
    writeFileSync(pathFor(id), data, { mode: 0o600 });
    stmtInsert.run({
      id, company_id: companyId, sha256, bytes: data.length, width: info.width, height: info.height,
      driver_id: driverId, user_id: userId,
    });
    return { photo: stmtGet.get(id, companyId), jpeg: data, duplicate: false };
  }

  /** Photo row for a company, or null. */
  function get(id, companyId) {
    if (!ID_RE.test(String(id))) return null;
    return stmtGet.get(id, companyId) ?? null;
  }

  function read(id) {
    return readFileSync(pathFor(id));
  }

  /** Send a stored photo (caller has already checked access). */
  function send(res, id) {
    res.set('Cache-Control', 'private, max-age=86400');
    res.type('image/jpeg');
    res.sendFile(pathFor(id), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: { code: 'not_found', message: 'Bilden finns inte.' } });
    });
  }

  return { save, get, read, send, pathFor };
}
