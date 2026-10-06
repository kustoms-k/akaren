import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderVagsedel } from './vagsedelImage.js';

/** Render the demo tickets and fill in the placeholder photo rows created by seedDemo. */
export async function renderDemoPhotos(db, photosDir, photos) {
  const update = db.prepare('UPDATE photos SET sha256 = ?, bytes = ?, width = ?, height = ? WHERE id = ?');
  for (const p of photos) {
    const jpeg = await renderVagsedel(p.slip, { blur: p.blur });
    const { width, height } = await sharp(jpeg).metadata();
    mkdirSync(join(photosDir, p.id.slice(0, 2)), { recursive: true });
    writeFileSync(join(photosDir, p.id.slice(0, 2), `${p.id}.jpg`), jpeg, { mode: 0o600 });
    update.run(createHash('sha256').update(jpeg).digest('hex'), jpeg.length, width, height, p.id);
  }
}
