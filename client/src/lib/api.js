// Thin JSON client for the Åkaren API. Errors carry the server's Swedish message
// and per-field messages so forms can show them inline.

const TOKEN_KEY = 'akaren_token';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Något gick fel. Försök igen.');
    this.status = status;
    this.code = body?.error?.code ?? 'unknown';
    this.fields = body?.error?.fields ?? {};
    this.body = body;
  }
}

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: session-only login */ }
};

// AuthContext subscribes to this so an expired session returns to the login page.
const unauthorizedListeners = new Set();
export const onUnauthorized = (fn) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: { code: 'network', message: 'Ingen kontakt med servern. Kontrollera anslutningen.' } });
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (res.status === 401 && token) unauthorizedListeners.forEach((fn) => fn());
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
