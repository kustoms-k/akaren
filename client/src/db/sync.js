import { db } from './dexie.js';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
  };
}

// ── Initial / periodic sync from server ───────────────────────────────────────
// Fetches all cacheable collections and bulk-puts them into IndexedDB.

export async function initialSync(token) {
  const get = (path) =>
    fetch(`/api${path}`, { headers: authHeaders(token) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const [quotes, jobs, fleet, drivers, templates, company] = await Promise.all([
    get('/quotes'),
    get('/jobs'),
    get('/fleet'),
    get('/drivers'),
    get('/templates'),
    get('/company'),
  ]);

  await db.transaction('rw', [
    db.quotes, db.jobs, db.fleet, db.drivers, db.templates, db.company, db.syncMeta,
  ], async () => {
    if (Array.isArray(quotes))    await db.quotes.bulkPut(quotes);
    if (Array.isArray(jobs))      await db.jobs.bulkPut(jobs);
    if (Array.isArray(fleet))     await db.fleet.bulkPut(fleet);
    if (Array.isArray(drivers))   await db.drivers.bulkPut(drivers);
    if (Array.isArray(templates)) await db.templates.bulkPut(templates);
    if (company?.id)              await db.company.put(company);
    await db.syncMeta.put({ key: 'lastSync', value: Date.now() });
  });
}

// ── Fleet stats sync — month-scoped aggregated data ──────────────────────────

export async function syncFleetStats(token, month) {
  const res = await fetch(`/api/fleet/stats?month=${month}`, { headers: authHeaders(token) });
  if (!res.ok) return;
  const data = await res.json();
  if (!Array.isArray(data)) return;
  await db.fleetStats.bulkPut(
    data.map((v) => ({ ...v, month, month_vehicleId: `${month}_${v.id}` })),
  );
}

// ── Sync queue drain — last-write-wins conflict resolution ────────────────────
// Processes pending queue items one at a time. Stops on network error.

let _draining = false;

export async function drainQueue(token, onConflict) {
  if (_draining || !navigator.onLine) return;
  _draining = true;

  try {
    while (true) {
      if (!navigator.onLine) break;

      const item = await db.syncQueue.where('status').equals('pending').first();
      if (!item) break;

      await db.syncQueue.update(item.id, { status: 'syncing' });

      try {
        const res = await fetch(`/api${item.endpoint}`, {
          method:  item.method,
          headers: authHeaders(token),
          body:    item.body != null ? JSON.stringify(item.body) : undefined,
        });

        if (res.ok) {
          // Update local store with server response when available
          if (item.method !== 'DELETE' && item.localTable && db[item.localTable]) {
            const ct = res.headers.get('content-type') ?? '';
            if (ct.includes('json')) {
              const serverData = await res.json().catch(() => null);
              if (serverData && typeof serverData === 'object' && !serverData.ok) {
                await db[item.localTable].put(serverData);
              }
            }
          }
          await db.syncQueue.delete(item.id);

        } else if (res.status === 409) {
          // Conflict: server wins — update local, notify user
          const serverData = await res.json().catch(() => null);
          if (serverData && item.localTable && db[item.localTable]) {
            await db[item.localTable].put(serverData);
          }
          await db.syncQueue.delete(item.id);
          onConflict?.(
            `Konflikt löst — serverdata tog precedens / Conflict resolved — server data took precedence`,
          );

        } else if ((item.retries ?? 0) >= 3) {
          await db.syncQueue.update(item.id, {
            status: 'error',
            errorMsg: `HTTP ${res.status}`,
          });

        } else {
          await db.syncQueue.update(item.id, {
            status:  'pending',
            retries: (item.retries ?? 0) + 1,
          });
        }
      } catch {
        // Network error — stop draining, keep item pending for next attempt
        await db.syncQueue.update(item.id, {
          status:  'pending',
          retries: (item.retries ?? 0) + 1,
        });
        break;
      }
    }
  } finally {
    _draining = false;
  }
}

// ── Pricing insights sync ─────────────────────────────────────────────────────
// Fetches precomputed insights and caches them in IndexedDB for offline use.

export async function syncPricingInsights(token) {
  const res = await fetch('/api/pricing-insights', { headers: authHeaders(token) });
  if (!res.ok) return;
  const data = await res.json();
  if (!Array.isArray(data.insights) || data.insights.length === 0) {
    // Still write the status record so the panel can show unlock progress
    await db.pricingInsights.put({
      insight_type: 'status',
      insight_data: {
        unlocked:      data.unlocked,
        accepted_count: data.accepted_count,
        threshold:     data.threshold,
      },
      confidence:  1.0,
      created_at:  new Date().toISOString(),
    });
    return;
  }
  await db.pricingInsights.bulkPut(
    data.insights.map((r) => ({
      insight_type: r.insight_type,
      insight_data: r.insight_data,
      confidence:   r.confidence,
      created_at:   r.created_at,
    })),
  );
}

// ── Enqueue a write operation ─────────────────────────────────────────────────
// Applies the local change to IndexedDB immediately, then adds to sync queue.

export async function enqueueWrite({ endpoint, method, body, localTable, localId, localData }) {
  // Optimistic local update
  if (localData && localTable && db[localTable]) {
    await db[localTable].put(localData);
  } else if (method === 'DELETE' && localTable && localId != null && db[localTable]) {
    await db[localTable].delete(localId);
  }

  await db.syncQueue.add({
    endpoint:   endpoint,
    method:     method,
    body:       body ?? null,
    localTable: localTable ?? null,
    localId:    localId   ?? null,
    status:     'pending',
    retries:    0,
    createdAt:  Date.now(),
    errorMsg:   null,
  });
}
