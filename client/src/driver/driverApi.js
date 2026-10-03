import { api } from '../lib/api.js';

// Driver session (from the SMS link). Kept separate from the office login.
const KEY = 'akaren_driver_session';

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && Date.parse(s.expires_at) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: memory only */ }
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Exchange the link token for a session. Falls back to a stored session when offline. */
export async function startSession(linkToken) {
  try {
    const s = await api('/api/driver/session', { method: 'POST', body: { token: linkToken }, token: '' });
    const session = { token: s.token, expires_at: s.expires_at, link: linkToken };
    saveSession(session);
    return session;
  } catch (err) {
    const stored = loadSession();
    if (err.code === 'network' && stored) return stored;
    throw err;
  }
}

let current = null;
export const setCurrentSession = (s) => { current = s; };

export const driverApi = (path, opts = {}) => api(path, { ...opts, token: current?.token ?? '' });

/**
 * GET with an offline fallback: successful responses are kept on the phone, and the last copy
 * is returned when there is no coverage. Returns { data, stale }.
 */
export async function cachedGet(path) {
  const key = `akaren_driver_cache:${path}`;
  try {
    const data = await driverApi(path);
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage full or disabled */ }
    return { data, stale: false };
  } catch (err) {
    if (err.code !== 'network') throw err;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key)); } catch { /* ignore */ }
    if (cached == null) throw err;
    return { data: cached, stale: true };
  }
}

export function uploadPhoto(assignmentId, blob, { extract = true } = {}) {
  const form = new FormData();
  form.append('assignment_id', String(assignmentId));
  form.append('extract', extract ? '1' : '0');
  form.append('photo', blob, 'vagsedel.jpg');
  return driverApi('/api/driver/photos', { method: 'POST', form, body: null });
}

/** RFC 4122 v4 UUID. crypto.randomUUID only exists on HTTPS/localhost; the LAN page is plain HTTP. */
export function uuid() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* insecure context */ }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
