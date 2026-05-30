import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER = "'Geist', system-ui, sans-serif";
const MONO  = "'Geist', system-ui, sans-serif";

const fmtKr = (n) => n == null ? '—'
  : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

function EuroBadge({ euroKlass, lez_compliant }) {
  const ok = lez_compliant;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, fontFamily: MONO, fontFeatureSettings: '"tnum"',
      padding: '2px 6px', borderRadius: 4,
      background: ok ? 'rgba(34,197,94,0.10)' : 'rgba(231,76,60,0.10)',
      color:      ok ? '#15803d'               : '#b91c1c',
      border:     `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(231,76,60,0.25)'}`,
    }}>
      {ok ? '✓' : '✗'} Euro {euroKlass ?? '?'}
    </span>
  );
}

function CostBar({ value, max, accent }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ flex: 1, height: 4, background: '#f0ede8', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: '#1c1917', minWidth: 60, textAlign: 'right', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
        {fmtKr(value)}
      </span>
    </div>
  );
}

export function VehicleComparisonPanel({ routeData, onOverride }) {
  const { t }                     = useLanguage();
  const [expanded, setExpanded]   = useState(false);

  const { vehicle_comparison: comparison, optimal_vehicle: optimal, reasoning } = routeData ?? {};
  if (!comparison?.length || !optimal) return null;

  const tm  = t.vehicleComparison;
  const maxCost = Math.max(...comparison.map((v) => v.cost.total_kr));

  const isOptimalDifferentFromFirst = comparison.length > 1
    && comparison[0].ext_id !== optimal.ext_id;

  return (
    <div style={{
      background:   '#fafaf8',
      border:       '1px solid #e6e2da',
      borderRadius: 10,
      overflow:     'hidden',
      fontFamily:   INTER,
    }}>
      {/* Recommendation header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #e6e2da' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a09590', marginBottom: 4 }}>
              {tm.heading}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>
                {optimal.ext_id}
              </span>
              <span style={{ fontSize: 12, color: '#6b6359' }}>
                {optimal.namn}
              </span>
              <EuroBadge euroKlass={optimal.euro_klass} lez_compliant={optimal.lez_compliant} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', fontFamily: MONO, fontFeatureSettings: '"tnum"' }}>
                {fmtKr(optimal.cost.total_kr)}
              </span>
            </div>
            {reasoning && (
              <div style={{ fontSize: 11, color: '#6b6359', marginTop: 5, lineHeight: 1.5 }}>
                {reasoning}
              </div>
            )}
          </div>
          {onOverride && (
            <button
              onClick={() => onOverride(optimal.ext_id)}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 600, fontFamily: INTER,
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                background: '#1c1917', color: '#fff', border: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {tm.useThis}
            </button>
          )}
        </div>
      </div>

      {/* Expandable comparison table */}
      {comparison.length > 1 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              width: '100%', padding: '8px 14px', background: 'transparent',
              border: 'none', borderBottom: expanded ? '1px solid #e6e2da' : 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: INTER, fontSize: 11, color: '#6b6359',
            }}
          >
            <span>{tm.showAll(comparison.length)}</span>
            <span style={{ fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              ›
            </span>
          </button>

          {expanded && (
            <div style={{ padding: '0 0 6px' }}>
              {comparison.map((v, i) => {
                const isOpt  = v.ext_id === optimal.ext_id;
                const saving = isOpt ? null : v.cost.total_kr - optimal.cost.total_kr;
                return (
                  <div
                    key={v.ext_id}
                    style={{
                      padding: '9px 14px',
                      background: isOpt ? 'rgba(34,197,94,0.04)' : 'transparent',
                      borderLeft: isOpt ? '3px solid #22c55e' : '3px solid transparent',
                      borderBottom: i < comparison.length - 1 ? '1px solid #f0ede8' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', fontFamily: MONO, fontFeatureSettings: '"tnum"' }}>
                        {v.ext_id}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b6359', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.namn}
                      </span>
                      <EuroBadge euroKlass={v.euro_klass} lez_compliant={v.lez_compliant} />
                      {isOpt && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: 'rgba(34,197,94,0.10)', padding: '1px 6px', borderRadius: 4 }}>
                          {tm.recommended}
                        </span>
                      )}
                      {!isOpt && saving != null && saving > 0 && (
                        <span style={{ fontSize: 10, color: '#e74c3c', fontFamily: MONO, fontFeatureSettings: '"tnum"' }}>
                          +{fmtKr(saving)}
                        </span>
                      )}
                    </div>

                    <CostBar value={v.cost.total_kr} max={maxCost} accent={isOpt ? '#22c55e' : '#c0bdb8'} />

                    {/* Detail row */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: '#a09590' }}>
                        {tm.fuel}: {fmtKr(v.cost.fuel_kr)}
                      </span>
                      {v.cost.congestion_kr > 0 && (
                        <span style={{ fontSize: 10, color: '#a09590' }}>
                          {tm.congestion}: {fmtKr(v.cost.congestion_kr)}
                        </span>
                      )}
                      {v.cost.tolls_kr > 0 && (
                        <span style={{ fontSize: 10, color: '#a09590' }}>
                          {tm.bridge}: {fmtKr(v.cost.tolls_kr)}
                        </span>
                      )}
                      {v.cost.detour_kr > 0 && (
                        <span style={{ fontSize: 10, color: '#e74c3c' }}>
                          {tm.detour}: +{fmtKr(v.cost.detour_kr)} (+{Math.round(v.detour_km)} km)
                        </span>
                      )}
                    </div>

                    {!v.lez_compliant && v.lez_violations?.length > 0 && (
                      <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 3 }}>
                        ✗ {v.lez_violations.join(', ')}
                      </div>
                    )}

                    {!isOpt && onOverride && (
                      <button
                        onClick={() => onOverride(v.ext_id)}
                        style={{
                          marginTop: 6, fontSize: 10, fontWeight: 600, fontFamily: INTER,
                          padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                          background: 'transparent', color: '#6b6359',
                          border: '1px solid #e6e2da',
                        }}
                      >
                        {tm.useThis}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
