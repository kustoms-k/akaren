import { useEffect, useSyncExternalStore } from 'react';

// Minimal path router (history API). Pages are linkable without adding a dependency.
// The <Link> component lives in components/Link.jsx.

const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function subscribe(fn) {
  listeners.add(fn);
  window.addEventListener('popstate', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('popstate', fn);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to, { replace = false } = {}) {
  if (to === snapshot()) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
  notify();
}

/** Current location as { path, query }. Re-renders on navigation. */
export function useLocation() {
  const loc = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(loc, window.location.origin);
  return { path: url.pathname, query: url.searchParams };
}

/** Match a pattern like '/kunder/:id' against a path. Returns params or null. */
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

/** Scroll to top on path change. */
export function useScrollReset(path) {
  useEffect(() => { window.scrollTo(0, 0); }, [path]);
}
