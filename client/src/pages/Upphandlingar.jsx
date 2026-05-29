import { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Eye, EyeOff, X, Leaf, Truck, Star, StarOff, Clock, MapPin, Building2, ChevronDown } from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';

const INTER     = "'Geist', system-ui, sans-serif";
const MONO      = "'Geist Mono', monospace";
const BG_BASE   = '#f4f5f7';
const SURF      = '#ffffff';
const ACCENT    = '#2d3340';
const ACCENT_SF = '#eef0f3';
const BORDER    = '#e4e6ea';
const TEXT_PR   = '#1a1d24';
const TEXT_SEC  = '#4b5563';
const TEXT_MUT  = '#6b7280';
const SHADOW    = '0 1px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06)';
const D_GREEN   = '#16a34a';
const D_AMBER   = '#d97706';
const D_RED     = '#dc2626';

function fmt_sek(v) {
  if (!v) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} Mkr`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)} kkr`;
  return `${v} kr`;
}

function days_until(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - Date.now()) / 86_400_000);
  return diff;
}

function ScorePill({ score }) {
  const color = score >= 70 ? D_GREEN : score >= 45 ? D_AMBER : D_RED;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: color + '18', color,
      fontSize: 11, fontWeight: 700, fontFamily: INTER,
      letterSpacing: '0.02em',
    }}>
      {score}
    </span>
  );
}

function DeadlineBadge({ deadline }) {
  const d = days_until(deadline);
  if (d === null) return null;
  const urgent = d <= 7;
  const color  = urgent ? D_RED : d <= 21 ? D_AMBER : TEXT_MUT;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color, fontSize: 11, fontFamily: INTER }}>
      <Clock size={11} />
      {d <= 0 ? 'Utgången' : `${d} dagar`}
    </span>
  );
}

function TenderCard({ tender, onWatch, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const d = days_until(tender.deadline);
  const urgent = d !== null && d <= 7;

  return (
    <div style={{
      background: SURF,
      borderRadius: 14,
      boxShadow: SHADOW,
      border: `1px solid ${urgent ? '#fecaca' : BORDER}`,
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Score + icon */}
        <div style={{
          flexShrink: 0,
          width: 44, height: 44,
          borderRadius: 12,
          background: ACCENT_SF,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ScrollText size={18} color={ACCENT} strokeWidth={1.5} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_PR, fontFamily: INTER, lineHeight: 1.3 }}>
              {tender.titel}
            </span>
            <ScorePill score={tender.relevans_score} />
            {tender.co2_fordel === 1 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 20,
                background: '#dcfce7', color: D_GREEN,
                fontSize: 10, fontWeight: 700, fontFamily: INTER,
              }}>
                <Leaf size={9} /> CO₂-fördel
              </span>
            )}
            {urgent && (
              <span style={{
                padding: '2px 8px', borderRadius: 20,
                background: '#fee2e2', color: D_RED,
                fontSize: 10, fontWeight: 700, fontFamily: INTER,
              }}>
                Brådskande
              </span>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            {tender.kopare && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: TEXT_SEC, fontFamily: INTER }}>
                <Building2 size={11} /> {tender.kopare}
              </span>
            )}
            {tender.region && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: TEXT_SEC, fontFamily: INTER }}>
                <MapPin size={11} /> {tender.region}
              </span>
            )}
            {tender.estimerat_varde_sek && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: TEXT_SEC, fontFamily: INTER }}>
                <span style={{ fontSize: 10, opacity: 0.6 }}>Värde</span>
                <span style={{ fontWeight: 600, color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt_sek(tender.estimerat_varde_sek)}
                </span>
              </span>
            )}
            <DeadlineBadge deadline={tender.deadline} />
          </div>

          {/* Fleet assessment */}
          {tender.flotta_orsak && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 8,
              background: tender.flotta_kan_hantera ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${tender.flotta_kan_hantera ? '#bbf7d0' : '#fed7aa'}`,
              fontSize: 11, fontFamily: INTER,
              color: tender.flotta_kan_hantera ? D_GREEN : D_AMBER,
            }}>
              <Truck size={11} />
              <span style={{ fontWeight: 600 }}>Passar din flotta:</span>
              <span>{tender.flotta_orsak}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onWatch(tender.id, tender.watched)}
            title={tender.watched ? 'Sluta bevaka' : 'Bevaka'}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: tender.watched ? ACCENT : BG_BASE,
              color: tender.watched ? '#fff' : TEXT_SEC,
              border: `1px solid ${tender.watched ? ACCENT : BORDER}`,
              fontSize: 11, fontWeight: 600, fontFamily: INTER,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 120ms',
            }}
          >
            {tender.watched ? <Star size={11} fill="currentColor" /> : <StarOff size={11} />}
            {tender.watched ? 'Bevakad' : 'Bevaka'}
          </button>
          {tender.url && (
            <a
              href={tender.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 12px', borderRadius: 8,
                background: BG_BASE, color: TEXT_SEC,
                border: `1px solid ${BORDER}`,
                fontSize: 11, fontWeight: 600, fontFamily: INTER,
                cursor: 'pointer', textDecoration: 'none', textAlign: 'center',
              }}
            >
              Öppna
            </a>
          )}
          <button
            onClick={() => onDismiss(tender.id)}
            title="Ignorera"
            style={{
              padding: '5px 8px', borderRadius: 8,
              background: 'transparent', color: TEXT_MUT,
              border: `1px solid transparent`,
              fontSize: 10, fontFamily: INTER, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <X size={10} /> Ignorera
          </button>
        </div>
      </div>

      {/* Expandable description */}
      {tender.beskrivning && (
        <div style={{ borderTop: `1px solid ${BG_BASE}` }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              width: '100%', padding: '8px 20px',
              background: 'transparent', border: 'none',
              fontSize: 11, color: TEXT_MUT, fontFamily: INTER,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              textAlign: 'left',
            }}
          >
            <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '120ms' }} />
            {expanded ? 'Dölj' : 'Visa beskrivning'}
          </button>
          {expanded && (
            <div style={{ padding: '0 20px 14px', fontSize: 12, color: TEXT_SEC, fontFamily: INTER, lineHeight: 1.6 }}>
              {tender.beskrivning}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Upphandlingar() {
  const [tenders,    setTenders]    = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters,    setFilters]    = useState({ region: '', min_score: '', co2_only: false, watched_only: false });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.region)      params.set('region',      filters.region);
    if (filters.min_score)   params.set('min_score',   filters.min_score);
    if (filters.co2_only)    params.set('co2_only',    '1');
    if (filters.watched_only) params.set('watched_only', '1');

    const [list, s] = await Promise.all([
      apiFetch(`/api/upphandlingar?${params}`).then((r) => r.ok ? r.json() : []),
      apiFetch('/api/upphandlingar/stats').then((r) => r.ok ? r.json() : null),
    ]);
    if (Array.isArray(list)) setTenders(list);
    if (s)    setStats(s);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await apiFetch('/api/upphandlingar/refresh', { method: 'POST' });
    await load();
    setRefreshing(false);
  };

  const handleWatch = async (id, currentlyWatched) => {
    const res = await apiFetch(`/api/upphandlingar/${id}/watch`, { method: 'PUT' }).then((r) => r.ok ? r.json() : null);
    if (res) {
      setTenders(prev => prev.map(t => t.id === id ? { ...t, watched: res.watched ? 1 : 0 } : t));
      if (stats) setStats(s => ({ ...s, watched: s.watched + (res.watched ? 1 : -1) }));
    }
  };

  const handleDismiss = async (id) => {
    await apiFetch(`/api/upphandlingar/${id}/dismiss`, { method: 'PUT' });
    setTenders(prev => prev.filter(t => t.id !== id));
    if (stats) setStats(s => ({ ...s, total: Math.max(0, s.total - 1) }));
  };

  const regions = [...new Set(tenders.map(t => t.region).filter(Boolean))].sort();

  return (
    <div style={{ padding: '28px 32px', fontFamily: INTER, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT_PR, margin: 0, letterSpacing: '-0.02em' }}>
            Upphandlingar
          </h1>
          <p style={{ fontSize: 13, color: TEXT_MUT, margin: '4px 0 0', fontWeight: 400 }}>
            Matchade upphandlingar baserade på din flotta och verksamhetsregion
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 10,
            background: ACCENT, color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 600, fontFamily: INTER,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            opacity: refreshing ? 0.7 : 1,
            transition: 'opacity 150ms',
          }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Hämtar...' : 'Hämta nya'}
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Aktiva',        value: stats.total,        color: TEXT_PR },
            { label: 'Bevakade',      value: stats.watched,      color: ACCENT },
            { label: 'Utgår snart',   value: stats.expiring_week, color: stats.expiring_week > 0 ? D_AMBER : TEXT_PR },
            { label: 'CO₂-fördel',   value: stats.co2_advantage, color: D_GREEN },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: SURF, borderRadius: 12, padding: '14px 18px',
              boxShadow: SHADOW, border: `1px solid ${BORDER}`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
                {value ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: TEXT_MUT, marginTop: 2, fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20,
        padding: '12px 16px', background: SURF, borderRadius: 12,
        border: `1px solid ${BORDER}`, boxShadow: SHADOW,
      }}>
        <select
          value={filters.region}
          onChange={e => setFilters(f => ({ ...f, region: e.target.value }))}
          style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}`,
            fontSize: 12, fontFamily: INTER, color: TEXT_PR, background: BG_BASE,
            cursor: 'pointer',
          }}
        >
          <option value="">Alla regioner</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={filters.min_score}
          onChange={e => setFilters(f => ({ ...f, min_score: e.target.value }))}
          style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}`,
            fontSize: 12, fontFamily: INTER, color: TEXT_PR, background: BG_BASE,
            cursor: 'pointer',
          }}
        >
          <option value="">Alla relevanspoäng</option>
          <option value="70">Hög relevans (70+)</option>
          <option value="50">Medel+ (50+)</option>
          <option value="30">Alla match (30+)</option>
        </select>

        {[
          { key: 'co2_only',    label: 'CO₂-fördel' },
          { key: 'watched_only', label: 'Bevakade' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: filters[key] ? ACCENT : BG_BASE,
              color: filters[key] ? '#fff' : TEXT_SEC,
              border: `1px solid ${filters[key] ? ACCENT : BORDER}`,
              fontSize: 12, fontWeight: 600, fontFamily: INTER, cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tender list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: TEXT_MUT, fontFamily: INTER, fontSize: 13 }}>
          Laddar upphandlingar...
        </div>
      ) : tenders.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 32px',
          background: SURF, borderRadius: 16, border: `1px solid ${BORDER}`,
        }}>
          <ScrollText size={36} color={TEXT_MUT} strokeWidth={1} style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: TEXT_PR, margin: '0 0 6px' }}>
            Inga upphandlingar hittades
          </p>
          <p style={{ fontSize: 13, color: TEXT_MUT, margin: 0 }}>
            Klicka "Hämta nya" för att söka efter aktuella upphandlingar
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tenders.map(tender => (
            <TenderCard
              key={tender.id}
              tender={tender}
              onWatch={handleWatch}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
