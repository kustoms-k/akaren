import Dexie from 'dexie';
import { driverApi, uploadPhoto } from './driverApi.js';

// Lass that couldn't be sent (no coverage) wait here and are retried automatically.
// Item: { id, client_uuid, assignment_id, photo?: Blob, photo_id?, ai_extraction_id?, fields, note?, created_at, error? }

const db = new Dexie('akaren_driver');
db.version(1).stores({ outbox: '++id, client_uuid, assignment_id' });

const listeners = new Set();
const notify = async () => {
  const items = await db.outbox.toArray();
  listeners.forEach((fn) => fn(items));
};

export function subscribeOutbox(fn) {
  listeners.add(fn);
  db.outbox.toArray().then(fn).catch(() => fn([]));
  return () => listeners.delete(fn);
}

export async function queueLass(item) {
  await db.outbox.add({ ...item, created_at: new Date().toISOString() });
  notify();
}

let syncing = null;

/** Send queued lass. Stops at the first network failure; 4xx errors are kept on the item for the driver to see. */
export function syncOutbox() {
  if (syncing) return syncing;
  syncing = (async () => {
    let sent = 0;
    try {
      for (const item of await db.outbox.toArray()) {
        if (item.error) continue;
        try {
          let photoId = item.photo_id ?? null;
          if (!photoId && item.photo) {
            const up = await uploadPhoto(item.assignment_id, item.photo, { extract: false });
            photoId = up.photo_id;
            await db.outbox.update(item.id, { photo_id: photoId, photo: null });
          }
          await driverApi('/api/driver/lass', {
            method: 'POST',
            body: {
              assignment_id: item.assignment_id, client_uuid: item.client_uuid, photo_id: photoId,
              ai_extraction_id: item.ai_extraction_id ?? null, fields: item.fields, note: item.note ?? null,
            },
          });
          await db.outbox.delete(item.id);
          sent++;
        } catch (err) {
          if (err.code === 'network' || err.status >= 500 || err.status === 429) break;
          await db.outbox.update(item.id, { error: err.message });
        }
      }
    } finally {
      syncing = null;
      notify();
    }
    return sent;
  })();
  return syncing;
}

export async function discardOutboxItem(id) {
  await db.outbox.delete(id);
  notify();
}
