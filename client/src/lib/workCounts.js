import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { onInboxChanged } from './inboxEvents.js';

// What is waiting for the office, for the sidebar badges: order mail, drafts, lass to review (and overdue
// hazardous-waste reports), weighings with no lass. One shared store so every badge shows the same numbers.
// Pages that change any of these call workChanged() after the change.

const EMPTY = { inbox: 0, drafts: 0, review: 0, hazardOverdue: 0, hazardOpen: 0, weighMissing: 0, loaded: false };
let state = EMPTY;
const listeners = new Set();
let inflight = null;

async function load() {
  if (inflight) return inflight;
  const get = (path) => api(path).catch(() => null);
  inflight = Promise.all([
    get('/api/inbox/summary'), get('/api/intake?status=utkast'), get('/api/lass/summary'), get('/api/avstamning/summary'),
  ]).then(([inbox, drafts, lass, avst]) => {
    state = {
      inbox: inbox?.att_hantera ?? 0,
      drafts: drafts?.length ?? 0,
      review: lass?.to_review ?? 0,
      hazardOverdue: lass?.hazard_overdue ?? 0,
      hazardOpen: lass?.hazard_unreported ?? 0,
      weighMissing: avst?.saknas ?? 0,
      loaded: true,
    };
    listeners.forEach((fn) => fn());
  }).finally(() => { inflight = null; });
  return inflight;
}

/** Re-count after something changed (a lass approved, a lass created from a weighing list, …). */
export const workChanged = () => { load(); };

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The counts; refreshed when `refreshKey` changes (e.g. the path), when the inbox changes, and every minute. */
export function useWorkCounts(refreshKey) {
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    const off = onInboxChanged(load);
    return () => { clearInterval(timer); off(); };
  }, [refreshKey]);
  return useSyncExternalStore(subscribe, () => state);
}
