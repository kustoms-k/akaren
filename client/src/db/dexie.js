import Dexie from 'dexie';

export const db = new Dexie('akaren_v1');

db.version(1).stores({
  company:    'id',
  quotes:     'rawId, status, created_at',
  jobs:       'id, status, created_at',
  fleet:      'id',
  fleetStats: '&month_vehicleId, month',   // keyed by `${month}_${vehicleId}`
  drivers:    'id',
  templates:  'id',
  syncQueue:  '++id, status, createdAt',
  syncMeta:   'key',
});

// v2: pricing intelligence — keyed by insight_type, one row per type per company
db.version(2).stores({
  pricingInsights: '&insight_type',
});

// v3: add missing indexes needed by orderBy queries
db.version(3).stores({
  templates: 'id, created_at',
  drivers:   'id, truck_id',
});

// Close the database when Vite hot-replaces this module, otherwise the stale
// connection blocks the v2 upgrade on the next reload.
if (import.meta.hot) {
  import.meta.hot.dispose(() => db.close());
}
