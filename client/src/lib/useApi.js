import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * Load JSON from `path` (null skips). Previous data stays visible while reloading.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(path) {
  const [nonce, setNonce] = useState(0);
  const key = path ? `${path}#${nonce}` : null;
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();
    api(path, { signal: ctrl.signal })
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult((r) => ({ key, data: r.data, error }));
      });
    return () => ctrl.abort();
  }, [key, path]);

  const loading = Boolean(key) && result.key !== key;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (next) => setResult((r) => ({ ...r, data: typeof next === 'function' ? next(r.data) : next })),
    [],
  );

  return { data: result.data, error: loading ? null : result.error, loading, reload, setData };
}
