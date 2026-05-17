import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, useMemo,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth }       from './AuthContext.jsx';
import { db }            from '../db/dexie.js';
import { initialSync, drainQueue, enqueueWrite, syncPricingInsights } from '../db/sync.js';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const { token } = useAuth();

  const [isOnline,    setIsOnline]    = useState(() => navigator.onLine);
  const [isDraining,  setIsDraining]  = useState(false);
  const [conflictMsg, setConflictMsg] = useState(null);
  const drainRef = useRef(false);

  // Reactive counts from IndexedDB
  const pendingCount = useLiveQuery(
    () => db.syncQueue.where('status').anyOf('pending', 'syncing').count(),
    [],
    0,
  ) ?? 0;

  const errorCount = useLiveQuery(
    () => db.syncQueue.where('status').equals('error').count(),
    [],
    0,
  ) ?? 0;

  const syncStatus = useMemo(() => {
    if (!isOnline)                            return 'offline';
    if (isDraining || pendingCount > 0)       return 'syncing';
    if (errorCount > 0)                       return 'error';
    return 'synced';
  }, [isOnline, isDraining, pendingCount, errorCount]);

  // ── Online / offline events ───────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ── Queue drain ───────────────────────────────────────────────────────────
  const runDrain = useCallback(async () => {
    if (!token || !navigator.onLine || drainRef.current) return;
    drainRef.current = true;
    setIsDraining(true);
    try {
      await drainQueue(token, (msg) => setConflictMsg(msg));
    } finally {
      drainRef.current = false;
      setIsDraining(false);
    }
  }, [token]);

  // Drain whenever we come online or new items are queued
  useEffect(() => {
    if (isOnline && pendingCount > 0 && token) runDrain();
  }, [isOnline, pendingCount, token, runDrain]);

  // ── Initial sync + periodic background sync ───────────────────────────────
  useEffect(() => {
    if (!token) return;

    const doSync = () => {
      initialSync(token).catch(() => {});
      syncPricingInsights(token).catch(() => {});
    };

    doSync();

    const id = setInterval(() => {
      if (navigator.onLine) doSync();
    }, 60_000);

    return () => clearInterval(id);
  }, [token]);

  // ── Public enqueue helper ─────────────────────────────────────────────────
  const enqueue = useCallback(async (opts) => {
    await enqueueWrite(opts);
    runDrain();
  }, [runDrain]);

  return (
    <SyncContext.Provider value={{
      syncStatus,
      pendingCount,
      isOnline,
      conflictMsg,
      clearConflict: () => setConflictMsg(null),
      enqueue,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
