import { useState, useEffect } from 'react';
import { useLiveQuery }  from 'dexie-react-hooks';
import { db }            from '../db/dexie.js';
import { syncFleetStats } from '../db/sync.js';
import { useSync }       from '../context/SyncContext.jsx';
import { useLanguage }   from '../context/LanguageContext.jsx';
import { apiFetch }      from '../utils/apiFetch.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER   = '#B56510';
const AMBER_DK= '#9A6410';
const BG      = '#f4f5f7';
const WHITE   = '#ffffff';
const BORDER  = '#ececef';
const TEXT    = '#1a1d24';
const MUTED   = '#6b7280';
const FAINT   = '#9ca3af';
const OUTFIT  = "'Geist', system-ui, sans-serif";
const SURF    = '#ffffff';
const MONO    = "'Geist', system-ui, sans-serif";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function buildMonthOptions(lang) {
  const out = [];
  const now = new Date();
  const locale = lang === 'sv' ? 'sv-SE' : 'en-GB';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtNum = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n);

const EURO_BADGE = {
  6: { label: 'E6', color: '#3A9468', bg: 'rgba(58,148,104,0.10)' },
  5: { label: 'E5', color: '#B87A18', bg: 'rgba(184,122,24,0.10)' },
  4: { label: 'E4', color: '#B83C3C', bg: 'rgba(184,60,60,0.10)' },
};

function SortIndicator({ active, dir }) {
  if (!active) return <span style={{ color: FAINT, marginLeft: 3, fontSize: 9, fontWeight: 700 }}>–</span>;
  return <span style={{ color: AMBER, marginLeft: 3, fontSize: 9, fontWeight: 700 }}>{dir === 'asc' ? 'A' : 'Z'}</span>;
}

function ProfitCell({ value }) {
  if (value == null) return <span style={{ color: FAINT }}>—</span>;
  const isLow = value < 200;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 6,
      fontSize: 12, fontWeight: 600, textAlign: 'center', minWidth: 70,
      fontFamily: MONO, fontFeatureSettings: '"tnum"',
      color: isLow ? '#d97706' : '#16a34a',
      background: isLow ? '#fff7ed' : '#e8fdf0',
    }}>
      {fmtNum(value)} kr/h
    </span>
  );
}

function EuroBadge({ klass }) {
  const b = EURO_BADGE[klass] ?? EURO_BADGE[4];
  return (
    <span style={{
      fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.02em', textTransform: 'uppercase',
      color: b.color, background: b.bg, padding: '3px 10px', borderRadius: 6,
    }}>
      {b.label}
    </span>
  );
}

function MaintenanceBadge({ vehicleId, alerts }) {
  if (!alerts) return null;
  const vAlerts = alerts.filter((a) => a.vehicle_id === vehicleId);
  if (!vAlerts.length) return null;
  const critical = vAlerts.filter((a) => a.level === 'critical');
  const warning  = vAlerts.filter((a) => a.level === 'warning');
  if (critical.length) {
    return (
      <span title={critical.map((a) => a.label).join(', ')} style={{
        background: '#fee2e2', color: '#dc2626', fontFamily: OUTFIT,
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
        cursor: 'default', whiteSpace: 'nowrap',
      }}>
        {critical.length}× kritisk
      </span>
    );
  }
  return (
    <span title={warning.map((a) => a.label).join(', ')} style={{
      background: '#fef3c7', color: '#d97706', fontFamily: OUTFIT,
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      cursor: 'default', whiteSpace: 'nowrap',
    }}>
      {vAlerts.length}× varning
    </span>
  );
}

export function Fleet() {
  const { t, lang } = useLanguage();
  const { isOnline } = useSync();
  const [month,   setMonth]   = useState(currentMonth);
  const [sortKey, setSortKey] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [refreshing, setRefreshing] = useState(false);
  const [maintAlerts, setMaintAlerts] = useState(null);

  const MONTH_OPTIONS = buildMonthOptions(lang);

  const COLS = [
    { key: 'id',              label: t.fleet.cols.vehicle,       width: '7%',  align: 'left'   },
    { key: 'namn',            label: t.fleet.cols.name,          width: '13%', align: 'left'   },
    { key: 'typ',             label: t.fleet.cols.type,          width: '10%', align: 'left'   },
    { key: 'maxLast_kg',      label: t.fleet.cols.maxLoad,       width: '8%',  align: 'right'  },
    { key: 'monthly_revenue', label: t.fleet.cols.revenue,       width: '11%', align: 'right'  },
    { key: 'monthly_hours',   label: t.fleet.cols.hours,         width: '7%',  align: 'right'  },
    { key: 'profit_per_hour', label: t.fleet.cols.profitPerHour, width: '10%', align: 'right'  },
    { key: 'timkostnad_sek',  label: t.fleet.cols.costPerHour,   width: '9%',  align: 'right'  },
    { key: 'euro_klass',      label: t.fleet.cols.euro,          width: '6%',  align: 'center' },
    { key: 'lez_godkänd',     label: t.fleet.cols.lez,           width: '6%',  align: 'center' },
    { key: 'tillstånd',       label: t.fleet.cols.permits,       width: '5%',  align: 'center' },
    { key: '_maintenance',    label: 'Underhåll',                width: '8%',  align: 'center' },
  ];

  const cachedFleet = useLiveQuery(
    () => db.fleetStats.where('month').equals(month).toArray(),
    [month],
    null,
  );

  const fleet   = cachedFleet ?? [];
  const loading = cachedFleet === null;

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token || !isOnline) return;
    setRefreshing(true);
    syncFleetStats(token, month)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [month, isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    apiFetch('/api/underhall/alerts')
      .then((r) => r.ok ? r.json() : [])
      .then(setMaintAlerts)
      .catch(() => setMaintAlerts([]));
  }, [isOnline]);

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...fleet].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (typeof av === 'boolean') av = av ? 1 : 0;
    if (typeof bv === 'boolean') bv = bv ? 1 : 0;
    if (Array.isArray(av)) av = av.length;
    if (Array.isArray(bv)) bv = bv.length;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv, 'sv') : bv.localeCompare(av, 'sv');
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const lowCount = fleet.filter((v) => v.profit_per_hour != null && v.profit_per_hour < 200).length;

  const thStyle = (col) => ({
    fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
    letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED,
    padding: '10px 16px', textAlign: col.align, width: col.width,
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    background: sortKey === col.key ? '#e8e2d5' : SURF,
    transition: 'background 0.1s',
    borderBottom: `1px solid ${BORDER}`,
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: BG, minHeight: 0 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT, margin: '0 0 4px' }}>
            {t.fleet.heading}
          </h1>
          {!loading && lowCount > 0 && (
            <div style={{ fontFamily: OUTFIT, fontSize: 13, color: '#d97706' }}>
              {t.fleet.underperforming(lowCount)}
            </div>
          )}
          {refreshing && (
            <div style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT }}>
              {t.fleet.refreshing}
            </div>
          )}
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{
            fontFamily: OUTFIT, fontSize: 13, color: TEXT,
            background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 8,
            padding: '9px 14px', cursor: 'pointer', outline: 'none',
          }}
        >
          {MONTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && (
        <div style={{ fontFamily: OUTFIT, fontSize: 14, color: MUTED, textAlign: 'center', padding: 48 }}>
          {t.fleet.loading}
        </div>
      )}

      {!loading && (
        <>
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 20,
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
                <thead>
                  <tr>
                    {COLS.map((col) => (
                      <th key={col.key} style={thStyle(col)} onClick={() => handleSort(col.key)}>
                        {col.label}
                        <SortIndicator active={sortKey === col.key} dir={sortDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((v, i) => {
                    const isUnderperforming = v.profit_per_hour != null && v.profit_per_hour < 200;
                    return (
                      <tr
                        key={v.id}
                        style={{
                          background: WHITE,
                          borderBottom: i < sorted.length - 1 ? `1px solid ${BG}` : 'none',
                          borderLeft: isUnderperforming ? '3px solid #f59e0b' : '3px solid transparent',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = SURF}
                        onMouseLeave={(e) => e.currentTarget.style.background = WHITE}
                      >
                        <td style={{ fontFamily: MONO, fontSize: 13, padding: '12px 16px', color: AMBER, fontWeight: 600, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>{v.id}</td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', color: TEXT, verticalAlign: 'middle' }}>{v.namn}</td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', color: MUTED, verticalAlign: 'middle' }}>{v.typ}</td>
                        <td style={{ fontFamily: MONO, fontSize: 13, padding: '12px 16px', textAlign: 'right', color: MUTED, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>{fmtNum(v.maxLast_kg)} kg</td>
                        <td style={{ fontFamily: MONO, fontSize: 13, padding: '12px 16px', textAlign: 'right', color: TEXT, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>
                          {v.monthly_revenue > 0 ? fmtSEK(v.monthly_revenue) : <span style={{ color: FAINT }}>—</span>}
                        </td>
                        <td style={{ fontFamily: MONO, fontSize: 13, padding: '12px 16px', textAlign: 'right', color: TEXT, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>
                          {v.monthly_hours > 0 ? <span>{v.monthly_hours.toFixed(1)} h</span> : <span style={{ color: FAINT }}>—</span>}
                        </td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <ProfitCell value={v.profit_per_hour} />
                        </td>
                        <td style={{ fontFamily: MONO, fontSize: 13, padding: '12px 16px', textAlign: 'right', color: MUTED, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>{fmtNum(v.timkostnad_sek)} kr/h</td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <EuroBadge klass={v.euro_klass} />
                        </td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {v.lez_godkänd
                            ? <span style={{ color: '#16a34a', fontSize: 14, fontWeight: 700 }}>OK</span>
                            : <span style={{ color: FAINT, fontSize: 14 }}>—</span>}
                        </td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {v.tillstånd?.length > 0 ? (
                            <span title={v.tillstånd.join(', ')} style={{
                              fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                              color: '#3b82f6', background: '#eff6ff',
                              padding: '3px 10px', borderRadius: 6, cursor: 'default', whiteSpace: 'nowrap',
                            }}>
                              {t.fleet.permitsCount(v.tillstånd.length)}
                            </span>
                          ) : <span style={{ color: FAINT, fontSize: 13 }}>—</span>}
                        </td>
                        <td style={{ fontFamily: OUTFIT, fontSize: 12, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <MaintenanceBadge vehicleId={v.id} alerts={maintAlerts} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
              padding: '10px 16px', borderTop: `1px solid ${BORDER}`, background: SURF,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  borderLeft: '3px solid #f59e0b', background: '#fff7ed', flexShrink: 0,
                }} />
                <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                  {t.fleet.legend.underperforming}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  background: '#e8fdf0', border: '1px solid #16a34a', borderRadius: 2, flexShrink: 0,
                }} />
                <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>{t.fleet.legend.performing}</span>
              </div>
              <span style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT, marginLeft: 'auto', fontStyle: 'italic' }}>
                {t.fleet.legend.note}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: t.fleet.cards.total,                         value: fleet.length,                                          unit: t.fleet.cards.unitPcs },
              { label: t.fleet.cards.lez(fleet.length),             value: fleet.filter((v) => v.lez_godkänd).length,             unit: '' },
              { label: t.fleet.cards.withData(fleet.length),        value: fleet.filter((v) => v.monthly_hours > 0).length,       unit: '' },
              { label: t.fleet.cards.underperforming,               value: lowCount,                                              unit: t.fleet.cards.unitVehicles, warn: lowCount > 0 },
            ].map((card) => (
              <div key={card.label} style={{
                flex: 1, background: WHITE,
                border: `1px solid ${card.warn ? '#f59e0b' : BORDER}`,
                borderRadius: 12, padding: '20px 22px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                  color: FAINT, marginBottom: 10,
                }}>
                  {card.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontFamily: OUTFIT, fontSize: 26, fontWeight: 700,
                    color: card.warn ? '#d97706' : TEXT, lineHeight: 1,
                  }}>
                    {card.value}
                  </span>
                  {card.unit && (
                    <span style={{ fontFamily: OUTFIT, fontSize: 14, color: MUTED }}>{card.unit}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
