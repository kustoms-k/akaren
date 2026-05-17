/**
 * Authenticated fetch wrapper.
 * Reads the JWT from localStorage and adds Authorization: Bearer header.
 * On 401, clears stored auth and reloads (forces redirect to login).
 */
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('auth_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_company');
    window.location.reload();
  }

  return res;
}
