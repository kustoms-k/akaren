import { useState, useCallback, useEffect, useRef, useMemo, Component } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  LayoutDashboard, FilePlus, Briefcase, Truck, TrendingUp,
  Settings as SettingsIcon, LogOut, Bell, Search, X, DollarSign, FileText,
  AlertTriangle, Fuel, Shield, Lock, Users,
} from 'lucide-react';
import { useLiveQuery }   from 'dexie-react-hooks';
import { InquiryInput }              from './components/InquiryInput.jsx';
import { AnalysisStream }            from './components/AnalysisStream.jsx';
import { FleetPanel }                from './components/FleetPanel.jsx';
import { Toast }                     from './components/Toast.jsx';
import { MessagePanel }              from './components/MessagePanel.jsx';
import { PricingIntelligencePanel }  from './components/PricingIntelligencePanel.jsx';
import { Profitability }  from './pages/Profitability.jsx';
import { Fleet }          from './pages/Fleet.jsx';
import { Settings }       from './pages/Settings.jsx';
import { DataPrivacy }    from './pages/DataPrivacy.jsx';
import { Login }          from './pages/Login.jsx';
import { Audit }          from './pages/Audit.jsx';
import { Jobs }           from './pages/Jobs.jsx';
import { DpaModal }       from './components/DpaModal.jsx';
import { RouteMap }       from './components/RouteMap.jsx';
import { Customers }      from './pages/Customers.jsx';
import { Onboarding }     from './pages/Onboarding.jsx';
import { TourOverlay }    from './components/TourOverlay.jsx';
import { SplashScreen }  from './components/SplashScreen.jsx';
import { LogoFull, LogoMark } from './assets/Logo.jsx';
import { useAnalysis }   from './hooks/useAnalysis.js';
import { generatePdf }    from './utils/generatePdf.js';
import { apiFetch }       from './utils/apiFetch.js';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SyncProvider, useSync } from './context/SyncContext.jsx';
import { LanguageProvider, useLanguage } from './context/LanguageContext.jsx';
import { db }             from './db/dexie.js';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BLUE    = '#6366f1';
const BLUE_DK = '#4f46e5';
const VIOLET  = '#8b5cf6';
const CYAN    = '#06b6d4';
const BG      = '#f0f2f5';
const WHITE   = '#ffffff';
const BORDER  = '#e9ecef';
const TEXT    = '#1a1a2e';
const MUTED   = '#6c757d';
const FAINT   = '#9ca3af';
const INTER   = "'Inter', sans-serif";

const NOISE_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E")`;

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtDate = (str) => {
  if (!str) return '—';
  try {
    const d  = new Date(str.replace(' ', 'T'));
    const en = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
    const sv = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(d);
    return `${en} / ${sv}`;
  } catch { return str; }
};

const fmtPrice = (n) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ─── Static mock data ─────────────────────────────────────────────────────────
const REVENUE_DATA = [
  { month: 'Jan', value: 185000 },
  { month: 'Feb', value: 220000 },
  { month: 'Mar', value: 195000 },
  { month: 'Apr', value: 248000 },
  { month: 'Maj', value: 267000 },
  { month: 'Jun', value: 284500 },
];

function getActivity(t) {
  return [
    { dot: BLUE,      text: t.dashboard.activity.quoteCreated,   sub: 'AGR-2024-031',         time: '2 min' },
    { dot: '#2ecc71', text: t.dashboard.activity.jobSaved,       sub: 'Stockholm → Göteborg', time: '14 min' },
    { dot: '#60a5fa', text: t.dashboard.activity.smsSent,        sub: t.dashboard.activity.driverNotified, time: '1h' },
    { dot: '#a78bfa', text: t.dashboard.activity.invoiceGen,     sub: 'AGR-2024-030',         time: '2h' },
  ];
}

function getNavItems(t) {
  return [
    { id: 'dashboard',   label: t.nav.dashboard,    Icon: LayoutDashboard, ownerOnly: false },
    { id: 'new-quote',   label: t.nav.newQuote,     Icon: FilePlus,        ownerOnly: false },
    { id: 'jobs',        label: t.nav.jobs,         Icon: Briefcase,       ownerOnly: false },
    { id: 'fleet',       label: t.nav.fleet,        Icon: Truck,           ownerOnly: false },
    { id: 'lonsamhet',   label: t.nav.profitability,Icon: TrendingUp,      ownerOnly: false },
    { id: 'customers',   label: t.nav.customers,    Icon: Users,           ownerOnly: false },
    { id: 'settings',    label: t.nav.settings,     Icon: SettingsIcon,    ownerOnly: false },
    { id: 'audit',       label: t.nav.audit,        Icon: Shield,          ownerOnly: true  },
    { id: 'dataprivacy', label: t.nav.dataPrivacy,  Icon: Lock,            ownerOnly: true  },
  ];
}

function getStatusBadge(status, t) {
  if (status === 'PAID' || status === 'BETALD') {
    return { label: t.dashboard.status.paid,     bg: '#e8fdf0', color: '#16a34a' };
  }
  if (status === 'DECLINED' || status === 'AVBÖJD') {
    return { label: t.dashboard.status.declined, bg: '#fff0f0', color: '#e74c3c' };
  }
  return   { label: t.dashboard.status.pending,  bg: '#fff7ed', color: '#d97706' };
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
const NAV_DARK   = '#1a1a2e';
const NAV_HOVER  = 'rgba(255,255,255,0.07)';
const NAV_TEXT   = 'rgba(255,255,255,0.62)';
const NAV_ACTIVE_TEXT = '#ffffff';

function NavItem({ id, label, Icon, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      data-nav-id={id}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px',
        background: isActive
          ? 'linear-gradient(90deg, rgba(99,102,241,0.92) 0%, rgba(79,70,229,0.88) 100%)'
          : hovered ? NAV_HOVER : 'transparent',
        border: 'none',
        borderRadius: 8,
        color: isActive ? NAV_ACTIVE_TEXT : hovered ? 'rgba(255,255,255,0.85)' : NAV_TEXT,
        fontSize: 13, fontFamily: INTER, fontWeight: isActive ? 600 : 500,
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s, color 0.15s',
        lineHeight: 1.3,
        margin: '1px 0',
        boxShadow: isActive ? '0 2px 14px rgba(99,102,241,0.40)' : 'none',
      }}
    >
      <Icon size={15} strokeWidth={1.5} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.8 }} />
      <span>{label}</span>
    </button>
  );
}

// Subtle dot grid for the main app surface
const DOT_BG = {
  backgroundColor: '#f5f6fa',
  backgroundImage: `radial-gradient(circle, rgba(99,102,241,0.07) 1px, transparent 1px)`,
  backgroundSize: '26px 26px',
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, company, onLogout, userRole }) {
  const { t } = useLanguage();
  const visibleItems = getNavItems(t).filter((n) => !n.ownerOnly || userRole === 'owner');
  return (
    <aside style={{
      width: 224, flexShrink: 0,
      background: 'linear-gradient(180deg, #1a1a2e 0%, #141428 100%)',
      borderRight: 'none',
      display: 'flex', flexDirection: 'column',
      height: '100vh',
      boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        display: 'flex', flexDirection: 'column', gap: 4,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <LogoFull markSize={28} variant="light" />
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.32)',
          fontFamily: INTER, paddingLeft: 40, marginTop: 3,
          letterSpacing: '0.03em', textTransform: 'uppercase',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {company?.name ?? ''}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {visibleItems.map(({ id, label, Icon }) => (
          <NavItem
            key={id}
            id={id}
            label={label}
            Icon={Icon}
            isActive={activePage === id}
            onClick={() => onNavigate(id)}
          />
        ))}
      </nav>

      {/* Footer + Log out */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '12px 16px 14px', flexShrink: 0,
      }}>
        <div style={{
          fontFamily: INTER, fontSize: 10, color: 'rgba(255,255,255,0.22)',
          letterSpacing: '0.04em', marginBottom: 10,
        }}>
          v1.0
        </div>
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            color: 'rgba(255,255,255,0.45)', fontSize: 13, fontFamily: INTER,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 4px', width: '100%',
            borderRadius: 6,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
        >
          <LogOut size={14} strokeWidth={1.5} />
          <span>{t.nav.logOut}</span>
        </button>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function FuelBadge({ fuelPrice }) {
  if (!fuelPrice) return null;
  const isLive = fuelPrice.source !== 'fallback';
  const priceStr = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(fuelPrice.price_per_litre);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: '#f8f9fa', border: `1px solid ${BORDER}`, borderRadius: 6,
      padding: '4px 10px', flexShrink: 0,
    }}>
      <span style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED }}>Diesel</span>
      <span style={{ fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600, color: TEXT }}>
        {priceStr} kr
      </span>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: isLive ? '#2ecc71' : FAINT,
        boxShadow: isLive ? '0 0 5px rgba(46,204,113,0.5)' : 'none',
      }} />
    </div>
  );
}

function WeatherBadge({ weather }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!weather) return null;
  const isWinter = weather.is_winter;
  const sign     = weather.temp_c >= 0 ? '+' : '';

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onClick={() => isWinter && setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: isWinter ? 'rgba(245,158,11,0.08)' : '#f8f9fa',
          border: `1px solid ${isWinter ? '#f59e0b' : BORDER}`, borderRadius: 6,
          padding: '4px 10px',
          cursor: isWinter ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600, color: isWinter ? '#d97706' : TEXT }}>
          {sign}{weather.temp_c}°C
        </span>
        <span style={{ fontSize: '0.8125rem', lineHeight: 1 }}>{weather.icon}</span>
        <span style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED }}>
          {weather.condition} / {weather.condition_sv}
        </span>
        {isWinter && (
          <span style={{ fontFamily: INTER, fontSize: '0.5rem', letterSpacing: '0.06em', color: '#f59e0b' }}>
            ▾
          </span>
        )}
      </div>

      {open && isWinter && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 500, width: 300,
          background: WHITE, border: '1px solid #f59e0b', borderRadius: 8,
          padding: '10px 14px',
          fontFamily: INTER, fontSize: '0.6875rem', color: '#d97706', lineHeight: 1.6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {t.topbar.winterWarning}
        </div>
      )}
    </div>
  );
}

// ── Road alerts badge ────────────────────────────────────────────────────────
function RoadAlertsBadge({ alerts }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!alerts || alerts.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(239,68,68,0.07)', border: '1px solid #ef4444',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <AlertTriangle size={11} color="#dc2626" />
        <span style={{ fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600, color: '#dc2626' }}>
          {t.roadAlerts.label(alerts.length)}
        </span>
        <span style={{ fontFamily: INTER, fontSize: '0.5rem', letterSpacing: '0.06em', color: '#dc2626' }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 500, width: 340,
          background: WHITE, border: '1px solid #fca5a5', borderRadius: 10,
          padding: '10px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          <div style={{ padding: '2px 14px 8px', fontFamily: INTER, fontSize: '0.625rem', letterSpacing: '0.06em', color: MUTED, textTransform: 'uppercase' }}>
            {t.roadAlerts.header}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {alerts.slice(0, 8).map((a) => (
              <div key={a.id} style={{
                padding: '8px 14px',
                borderTop: '1px solid #fee2e2',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 700, color: '#dc2626' }}>
                    {a.road}
                  </span>
                  <span style={{ fontFamily: INTER, fontSize: '0.625rem', color: TEXT, flex: 1 }}>
                    {a.location}
                  </span>
                </div>
                <div style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED }}>
                  {a.condition}{a.warnings?.length ? ' — ' + a.warnings.join(', ') : ''}
                </div>
              </div>
            ))}
          </div>
          {alerts.length > 8 && (
            <div style={{ padding: '6px 14px 2px', fontFamily: INTER, fontSize: '0.5625rem', color: MUTED }}>
              +{alerts.length - 8} till…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sync status indicator ────────────────────────────────────────────────────
function SyncDot() {
  const { syncStatus, pendingCount } = useSync();
  const { t } = useLanguage();

  const color = syncStatus === 'offline' ? '#e74c3c'
    : syncStatus === 'syncing'           ? '#f59e0b'
    : syncStatus === 'error'             ? '#e74c3c'
    : '#2ecc71';

  const label = syncStatus === 'offline'
    ? (pendingCount > 0 ? t.topbar.sync.offlineQueue(pendingCount) : t.topbar.sync.offline)
    : syncStatus === 'syncing' ? t.topbar.sync.syncing
    : syncStatus === 'error'   ? t.topbar.sync.error
    : t.topbar.sync.synced;

  const pulse = syncStatus !== 'offline' && syncStatus !== 'error';

  return (
    <div
      title={label}
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default', flexShrink: 0 }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
        {pulse && (
          <span style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%', background: color, opacity: 0.5,
            animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
          }} />
        )}
        <span style={{
          position: 'relative', display: 'inline-flex',
          width: 8, height: 8, borderRadius: '50%', background: color,
        }} />
      </span>
      <span style={{
        fontFamily: INTER, fontSize: '0.5625rem',
        color, letterSpacing: '0.04em', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  );
}

function TopBar({ fuelPrice, weather, roadAlerts, company }) {
  const { t, lang, setLang } = useLanguage();
  const now = new Date();
  const dateLocale = lang === 'sv' ? 'sv-SE' : 'en-GB';
  const todayStr = new Intl.DateTimeFormat(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return (
    <div style={{
      height: 56, flexShrink: 0,
      background: WHITE,
      borderBottom: `1px solid ${BORDER}`,
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16,
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Search
          size={14} color={MUTED}
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          placeholder={t.topbar.searchPlaceholder}
          style={{
            width: 260, height: 34,
            background: BG, border: 'none',
            borderRadius: 8, color: TEXT,
            fontFamily: INTER, fontSize: 13,
            paddingLeft: 32, paddingRight: 12,
            outline: 'none',
          }}
        />
      </div>

      {/* Live data badges */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FuelBadge fuelPrice={fuelPrice} />
        <WeatherBadge weather={weather} />
        <RoadAlertsBadge alerts={roadAlerts} />
      </div>

      {/* Sync status */}
      <SyncDot />

      {/* Language toggle */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {['en', 'sv'].map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              fontFamily: INTER, fontSize: 11, fontWeight: 600,
              background: lang === l ? BLUE : '#f0f2f5',
              color: lang === l ? WHITE : MUTED,
              border: `1px solid ${lang === l ? BLUE : '#e9ecef'}`,
              borderRadius: 6, padding: '4px 10px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Date + company */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontFamily: INTER, fontSize: '0.5rem', color: MUTED, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {todayStr}
        </span>
        <span style={{ fontFamily: INTER, fontSize: '0.5rem', color: BLUE, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          {company?.name ?? 'Åkaren'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <Bell size={16} color={MUTED} style={{ cursor: 'pointer' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: WHITE, fontSize: 13, fontWeight: 600, fontFamily: INTER }}>SA</span>
          </div>
          <span style={{ color: TEXT, fontSize: 13, fontFamily: INTER }}>Sales Admin</span>
          <span style={{ color: '#2ecc71', fontSize: 8 }}>●</span>
        </div>
      </div>
    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ Icon, label, value, change, changeUp, accentColor }) {
  return (
    <div style={{
      background: WHITE,
      borderRadius: 12,
      padding: '20px 20px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)',
      border: '1px solid rgba(0,0,0,0.06)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Thin coloured top accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: accentColor, borderRadius: '12px 12px 0 0',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${accentColor}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={17} color={accentColor} strokeWidth={1.8} />
        </div>
        <span style={{
          fontSize: 11, fontFamily: INTER, fontWeight: 600,
          color: changeUp ? '#16a34a' : '#dc2626',
          background: changeUp ? '#f0fdf4' : '#fef2f2',
          padding: '3px 8px', borderRadius: 6,
          display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
        }}>
          {changeUp ? '↑' : '↓'} {change}
        </span>
      </div>
      <div style={{
        fontSize: 11, color: '#94a3b8', fontFamily: INTER, marginBottom: 6,
        fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.8px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 700, color: TEXT, fontFamily: INTER,
        lineHeight: 1.1, letterSpacing: '-0.025em',
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ quotes, fuelPrice, roadAlerts, onNewQuote }) {
  const { t } = useLanguage();
  const ACTIVITY = getActivity(t);
  const totalRevenue = quotes.reduce((sum, q) => sum + (Number(q.totalpris_sek) || 0), 0);
  const dieselValue  = fuelPrice ? fmtPrice(fuelPrice.price_per_litre) + ' kr/L' : '18.45 kr/L';
  const lezCount     = quotes.filter((q) => q.lez_varning).length;
  const displayQ     = quotes.slice(0, 5);

  const tdBase = {
    fontSize: 13, fontFamily: INTER, color: TEXT,
    padding: '12px 16px 12px 0',
    borderBottom: '1px solid #f0f2f5',
    verticalAlign: 'middle',
  };

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '20px 24px',
      ...DOT_BG,
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard
          Icon={DollarSign} accentColor="#6366f1"
          label={t.dashboard.totalRevenue}
          value={totalRevenue > 0
            ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(totalRevenue) + ' kr'
            : '284 500 kr'}
          change={`12% ${t.dashboard.vsYesterday}`} changeUp
        />
        <KpiCard
          Icon={FileText} accentColor="#10b981"
          label={t.dashboard.quotes}
          value={quotes.length > 0 ? String(quotes.length) : '23'}
          change={`3 ${t.dashboard.vsYesterday}`} changeUp
        />
        <KpiCard
          Icon={AlertTriangle} accentColor="#ef4444"
          label={t.dashboard.lezAlerts}
          value={quotes.length > 0 ? String(lezCount) : '2'}
          change={`1 ${t.dashboard.vsYesterday}`} changeUp={false}
        />
        <KpiCard
          Icon={Fuel} accentColor="#f59e0b"
          label={t.dashboard.dieselPrice}
          value={dieselValue}
          change={`0.12 ${t.dashboard.vsYesterday}`} changeUp={false}
        />
      </div>

      {/* ── Middle row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '62fr 38fr', gap: 16, minHeight: 280 }}>

        {/* Bar chart */}
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: INTER, marginBottom: 4 }}>
            {t.dashboard.monthlyRevenue}
          </div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: INTER, marginBottom: 18 }}>
            Jan – Jun 2024
          </div>
          <ResponsiveContainer width="100%" height={175}>
            <BarChart data={REVENUE_DATA} barCategoryGap="35%" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="barGradMain" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#a5b4fc" stopOpacity={1} />
                  <stop offset="55%"  stopColor="#6366f1" stopOpacity={1} />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#c4b5fd" stopOpacity={1} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.9} />
                </linearGradient>
                <filter id="barGlow">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false} tickLine={false}
                tick={{ fill: FAINT, fontSize: 11, fontFamily: INTER }}
              />
              <YAxis
                axisLine={false} tickLine={false}
                tick={{ fill: FAINT, fontSize: 10, fontFamily: INTER }}
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                width={30}
              />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                contentStyle={{
                  background: WHITE, border: `1px solid ${BORDER}`,
                  borderRadius: 8, fontSize: 11, fontFamily: INTER, color: TEXT,
                }}
                labelStyle={{ color: MUTED }}
                formatter={(v) => [
                  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v) + ' kr',
                  'Intäkt',
                ]}
              />
              <Bar dataKey="value" fill="url(#barGradMain)" radius={[6, 6, 0, 0]}
                style={{ filter: 'drop-shadow(0 2px 6px rgba(99,102,241,0.35))' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CTA card */}
        <div style={{
          background: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 100%)',
          borderRadius: 14, padding: '26px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          border: '1px solid rgba(99,102,241,0.18)',
          boxShadow: '0 4px 16px rgba(30,27,75,0.18)',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: WHITE, fontFamily: INTER, marginBottom: 10, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
              {t.dashboard.newQuoteCta}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontFamily: INTER, lineHeight: 1.65 }}>
              {t.dashboard.newQuoteCtaSub}
            </div>
          </div>
          <button
            onClick={onNewQuote}
            style={{
              marginTop: 28,
              background: WHITE, color: '#312e81',
              border: 'none', borderRadius: 8,
              padding: '13px 20px',
              fontSize: 12, fontWeight: 700, fontFamily: INTER,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {t.dashboard.analyseBtn}
          </button>
        </div>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Recent Activity */}
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: INTER, marginBottom: 18 }}>
            {t.dashboard.recentActivity}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ACTIVITY.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: item.dot, flexShrink: 0, marginTop: 5,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: TEXT, fontFamily: INTER }}>{item.text}</div>
                  <div style={{ fontSize: 11, color: MUTED, fontFamily: INTER, marginTop: 1 }}>{item.sub}</div>
                </div>
                <span style={{ fontSize: 11, color: MUTED, fontFamily: INTER, flexShrink: 0 }}>{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Quotes */}
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: INTER, marginBottom: 18 }}>
            {t.dashboard.recentQuotes}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {[t.dashboard.tableHeaders.no, t.dashboard.tableHeaders.date, t.dashboard.tableHeaders.cargo, t.dashboard.tableHeaders.amount, t.dashboard.tableHeaders.status].map((col) => (
                  <th key={col} style={{
                    textAlign: 'left', fontSize: 11,
                    color: MUTED, fontFamily: INTER, fontWeight: 600,
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    padding: '8px 16px 8px 0',
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayQ.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div style={{
                      padding: '32px 8px', textAlign: 'center',
                      fontFamily: INTER, fontSize: 12, color: MUTED, fontStyle: 'italic',
                    }}>
                      {t.dashboard.noJobsYet}
                    </div>
                  </td>
                </tr>
              ) : displayQ.map((q) => {
                const badge = getStatusBadge(q.status, t);
                return (
                  <tr key={q.id} style={{ cursor: 'default' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f9fa'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ ...tdBase, color: BLUE, fontFamily: INTER, fontSize: 12, fontWeight: 600 }}>{q.id}</td>
                    <td style={tdBase}>{fmtDate(q.created_at)}</td>
                    <td style={{ ...tdBase, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {q.lasttyp || '—'}
                    </td>
                    <td style={{ ...tdBase, fontFamily: INTER, whiteSpace: 'nowrap', fontWeight: 500 }}>{fmtSEK(q.totalpris_sek)}</td>
                    <td style={tdBase}>
                      <span style={{
                        fontSize: 11, fontFamily: INTER, fontWeight: 600,
                        letterSpacing: '0.02em',
                        padding: '3px 10px', borderRadius: 6,
                        background: badge.bg, color: badge.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Road conditions panel ────────────────────────────────────────── */}
      {roadAlerts !== undefined && (
        <div style={{ background: WHITE, border: `1px solid ${roadAlerts.length > 0 ? '#fca5a5' : BORDER}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={14} color={roadAlerts.length > 0 ? '#dc2626' : '#2ecc71'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: INTER }}>
              {t.roadAlerts.sweden}
            </span>
            {roadAlerts.length === 0 && (
              <span style={{ fontSize: 11, fontFamily: INTER, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, padding: '2px 8px' }}>
                {t.roadAlerts.normal}
              </span>
            )}
            {roadAlerts.length > 0 && (
              <span style={{ fontSize: 11, fontFamily: INTER, color: '#dc2626', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 5, padding: '2px 8px' }}>
                {t.roadAlerts.label(roadAlerts.length)}
              </span>
            )}
          </div>

          {roadAlerts.length === 0 ? (
            <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, fontStyle: 'italic' }}>
              {t.roadAlerts.none}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {roadAlerts.map((a) => (
                <div key={a.id} style={{
                  border: '1px solid #fee2e2', borderRadius: 8, padding: '10px 14px',
                  background: '#fff8f8',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, color: '#dc2626', flexShrink: 0 }}>
                      {a.road}
                    </span>
                    <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.location}
                    </span>
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 11, color: '#d97706', fontWeight: 500 }}>
                    {a.condition}
                  </div>
                  {a.warnings?.length > 0 && (
                    <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginTop: 2 }}>
                      {a.warnings.join(' · ')}
                    </div>
                  )}
                  {a.measurements?.length > 0 && (
                    <div style={{ fontFamily: INTER, fontSize: 10, color: FAINT, marginTop: 2 }}>
                      {a.measurements[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* bottom spacer */}
      <div style={{ height: 4 }} />
    </div>
  );
}

// ─── Placeholder pages ────────────────────────────────────────────────────────
function PlaceholderPage({ label }) {
  const { t } = useLanguage();
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...DOT_BG, flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 13, color: MUTED, fontFamily: INTER }}>{label}</div>
      <div style={{ fontSize: 11, color: FAINT, fontFamily: INTER }}>{t.placeholderPage.comingSoon}</div>
    </div>
  );
}

// ─── App (inner — only rendered when authenticated) ──────────────────────────
function AppInner() {
  const { t, lang } = useLanguage();
  const { user, company, logout, updateCompany } = useAuth();

  const {
    status, rawText, parsed, confidence, confidenceOverall, originalParsed, error, routeLive,
    extractionId, extractionModel,
    analyse, loadTemplate, setField, applyRoute,
  } = useAnalysis();

  const { isOnline, enqueue, conflictMsg, clearConflict } = useSync();

  const [lowApproved,        setLowApproved]        = useState(() => new Set());
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [activePage,      setActivePage]      = useState('dashboard');
  const [showNewQuote,    setShowNewQuote]     = useState(false);
  const [fuelPrice,       setFuelPrice]       = useState(null);
  const [weather,         setWeather]         = useState(null);
  const [roadAlerts,      setRoadAlerts]      = useState([]);
  const [quoteNumber,     setQuoteNumber]     = useState(null);
  const [shareToken,      setShareToken]      = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [routeLoading,    setRouteLoading]    = useState(false);
  const [routeAdvisory,   setRouteAdvisory]   = useState(null);
  const [routeData,       setRouteData]       = useState(null);
  const [toast,           setToast]           = useState(null);    // { message, variant }
  const [smsResult,       setSmsResult]       = useState(null);   // { status, driverName, error }
  const [mallModal,       setMallModal]       = useState(null);
  const [showMallManager,  setShowMallManager]  = useState(false);
  const [msgQuote,         setMsgQuote]         = useState(null);  // { rawId, id, lasttyp }
  const [fortnoxResult,    setFortnoxResult]    = useState(null);  // toast from OAuth redirect
  const [dpaAccepted,      setDpaAccepted]      = useState(() => Boolean(company?.dpa_accepted_at));

  // ── IndexedDB live reads — instant, no spinners ───────────────────────────
  const fleet     = useLiveQuery(() => db.fleet.toArray(),                     [], []) ?? [];
  const drivers   = useLiveQuery(() => db.drivers.toArray(),                   [], []) ?? [];
  const quotes    = useLiveQuery(() => db.quotes.orderBy('created_at').reverse().limit(30).toArray(), [], []) ?? [];
  const templates = useLiveQuery(() => db.templates.orderBy('created_at').reverse().toArray(), [], []) ?? [];

  // Detect OAuth redirect-back from Fortnox (?fortnox=connected or ?fortnox=error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fx = params.get('fortnox');
    if (!fx) return;
    // Clean the URL so a reload doesn't re-trigger
    const clean = window.location.pathname + window.location.hash.replace(/\?.*/, '');
    window.history.replaceState({}, '', clean);
    if (fx === 'connected') {
      setActivePage('settings');
      setFortnoxResult({ message: t.settings.fortnox.connected + ' — ' + t.settings.fortnox.heading, variant: 'success' });
    } else if (fx === 'error') {
      const msg = params.get('msg') ?? 'unknown error';
      setActivePage('settings');
      setFortnoxResult({ message: `${t.settings.fortnox.heading}: ${msg}`, variant: 'error' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fuel price + weather + road alerts are external/real-time — still fetch live
  useEffect(() => {
    apiFetch('/api/fuel-price').then((r) => r.json()).then(setFuelPrice).catch(() => {});
    apiFetch('/api/weather').then((r) => r.json()).then(setWeather).catch(() => {});
    apiFetch('/api/road-alerts').then((r) => r.json()).then((d) => setRoadAlerts(d.alerts ?? [])).catch(() => {});
  }, []);

  // Reset approvals and review gate whenever a fresh analysis starts
  useEffect(() => {
    if (status === 'streaming') {
      setLowApproved(new Set());
      setReviewAcknowledged(false);
      setRouteAdvisory(null);
      setRouteData(null);
    }
  }, [status]);

  // Auto-route via ORS once analysis completes (or template loaded)
  useEffect(() => {
    if (status !== 'done' || routeLive) return;
    const pickup     = parsed?.upphämtning;
    const delivery   = parsed?.leverans;
    const weight_ton = parsed?.vikt ? parseFloat(String(parsed.vikt).replace(',', '.')) : undefined;
    if (!pickup || !delivery || pickup === '…' || delivery === '…') return;
    if (String(pickup).length < 4 || String(delivery).length < 4) return;

    setRouteLoading(true);
    setRouteAdvisory(null);
    setRouteData(null);

    // Primary: /api/route — ORS HGV routing + Trafikverket disruptions + map data
    const routeCall = apiFetch('/api/route', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pickup, delivery }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setRouteData(d);
        if (d.distance_km != null) applyRoute(d.distance_km);
      })
      .catch(() => {});

    // Advisory: LEZ check + road condition warnings + recommendations
    const advisoryCall = apiFetch('/api/route-advisory', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pickup, delivery, weight_ton, lang }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setRouteAdvisory(d); })
      .catch(() => {});

    Promise.all([routeCall, advisoryCall]).finally(() => setRouteLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, parsed?.upphämtning, parsed?.leverans, routeLive]);

  // Gate: all low/none-confidence fields must be edited or checkbox-approved
  const lowConfidenceKeys = Object.entries(confidence ?? {})
    .filter(([, c]) => c === 'low' || c === 'none')
    .map(([k]) => k);

  const allLowResolved = lowConfidenceKeys.length === 0 || lowConfidenceKeys.every((key) => {
    const edited = originalParsed != null && parsed != null
      && String(parsed[key]) !== String(originalParsed[key]);
    return edited || lowApproved.has(key);
  });

  // Second gate: overall confidence threshold
  const belowThreshold = status === 'done' && confidenceOverall < 0.7;
  const canSave = allLowResolved && (!belowThreshold || reviewAcknowledged);

  function handleApprove(key, checked) {
    setLowApproved((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }

  const dismissToast = useCallback(() => setToast(null), []);

  // Surface conflict notifications from sync engine as toasts
  useEffect(() => {
    if (conflictMsg) {
      setToast({ message: conflictMsg, variant: 'warning' });
      clearConflict();
    }
  }, [conflictMsg, clearConflict]);

  function handleNavigate(id) {
    if (id === 'new-quote') { setShowNewQuote(true); return; }
    setActivePage(id);
  }

  function handleLoadTemplate(tpl) {
    loadTemplate(tpl);
    setQuoteNumber(null);
    setShareToken(null);
    setSmsResult(null);
    setShowNewQuote(true);
  }

  function openMallModal() {
    if (!parsed) return;
    const parts = [
      parsed.lasttyp,
      [parsed.upphämtning, parsed.leverans].filter(Boolean).join('→'),
    ].filter(Boolean);
    setMallModal({ name: parts.join(' · ') });
  }

  function openMallModalFromQuote(q) {
    const parts = [
      q.lasttyp,
      [q.upphämtning, q.leverans].filter(Boolean).join('→'),
    ].filter(Boolean);
    setMallModal({ name: parts.join(' · '), quoteData: q });
  }

  async function handleSaveMall() {
    if (!mallModal?.name.trim()) return;
    const src = mallModal.quoteData ?? parsed;
    if (!src) return;
    if (!isOnline) {
      setToast({ message: t.errors.network, variant: 'error' });
      return;
    }
    try {
      const body = {
        name:           mallModal.name.trim(),
        lasttyp:        src.lasttyp        ?? null,
        upphämtning:    src.upphämtning    ?? null,
        leverans:       src.leverans       ?? null,
        fordon_id:      src.fordon_rekommenderat ?? src.fordon_id ?? null,
        base_price_sek: src.totalpris_sek != null ? Number(src.totalpris_sek) : null,
      };
      const res = await apiFetch('/api/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json();
      // Write full template into Dexie immediately
      await db.templates.put({ ...body, id, created_at: new Date().toISOString() });
      setMallModal(null);
      setToast({ message: t.newQuote.templateManager.heading + ' ' + t.newQuote.templateModal.save, variant: 'success' });
    } catch { setToast({ message: t.errors.saveError, variant: 'error' }); }
  }

  async function handleDeleteTemplate(id) {
    // Optimistic delete from Dexie, queue server delete
    await enqueue({
      endpoint:   `/api/templates/${id}`,
      method:     'DELETE',
      localTable: 'templates',
      localId:    id,
    });
  }

  async function handleSave() {
    if (!parsed || saving) return;
    if (!isOnline) {
      setToast({ message: t.errors.network, variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      // Compute human overrides: fields changed from original AI output
      const humanOverrides = {};
      if (originalParsed) {
        for (const key of Object.keys(parsed)) {
          if (originalParsed[key] !== undefined &&
              String(parsed[key]) !== String(originalParsed[key])) {
            humanOverrides[key] = { from: originalParsed[key], to: parsed[key] };
          }
        }
      }

      const qRes = await apiFetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lasttyp:           parsed.lasttyp,
          upphämtning:       parsed.upphämtning,
          leverans:          parsed.leverans,
          datum:             parsed.datum,
          fordon_id:         parsed.fordon_rekommenderat,
          avstand_km:        parsed.avstand_km    != null ? Number(parsed.avstand_km)    : null,
          totalpris_sek:     parsed.totalpris_sek     != null ? Number(parsed.totalpris_sek)     : null,
          lez_varning:       parsed.lez_varning,
          tillstånd_krävs:   parsed['tillstånd_krävs'] ?? parsed.tillstand_kravs,
          noteringar:        parsed.noteringar,
          bränsle_kostnad:   parsed.bränsle_kostnad   != null ? Number(parsed.bränsle_kostnad)   : null,
          arbetstid_kostnad: parsed.arbetstid_kostnad != null ? Number(parsed.arbetstid_kostnad) : null,
          arbetstid_timmar:  parsed.arbetstid_timmar  != null ? Number(parsed.arbetstid_timmar)  : null,
          ai_extraction_id:  extractionId  ?? undefined,
          human_overrides:   Object.keys(humanOverrides).length ? humanOverrides : undefined,
          confidence_score:  confidenceOverall,
          review_status:     belowThreshold ? 'manual' : 'auto',
        }),
      });
      if (!qRes.ok) throw new Error(`HTTP ${qRes.status}`);
      const quote = await qRes.json();
      setQuoteNumber(quote.id);
      setShareToken(quote.token);

      // Persist new quote to IndexedDB immediately
      await db.quotes.put(quote).catch(() => {});

      const rawId = parseInt(String(quote.id).split('-').pop(), 10);
      const jRes  = await apiFetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: rawId }),
      });
      if (!jRes.ok) throw new Error(`HTTP ${jRes.status}`);
      const job = await jRes.json();
      // Persist new job to IndexedDB
      await db.jobs.put({ id: job.id, quote_id: rawId, status: 'planerad', created_at: new Date().toISOString() }).catch(() => {});
      setSmsResult({ status: job.sms_status, driverName: job.sms_driver_name, error: job.sms_error });

      if (job.sms_status === 'sent') {
        const who = job.sms_driver_name ?? t.settings.drivers.name;
        setToast({ message: `${t.jobs.heading} — SMS → ${who}`, variant: 'success' });
      } else if (job.sms_status === 'failed') {
        setToast({ message: `${t.jobs.heading} — SMS: ${job.sms_error ?? t.errors.network}`, variant: 'error' });
      } else {
        setToast({ message: `${t.jobs.heading} — SMS simulated`, variant: 'warning' });
      }
    } catch (e) {
      console.error('Save failed:', e);
      setToast({ message: t.errors.saveError, variant: 'error' });
    } finally { setSaving(false); }
  }

  function handleExport() {
    if (!parsed) return;
    generatePdf(parsed, quoteNumber, fleet, {
      userName:    user?.name ?? user?.email ?? 'Okänd',
      modelUsed:   extractionModel ?? 'claude-sonnet-4',
      generatedAt: new Date().toISOString().slice(0, 10),
    });
  }

  const lezVarning     = parsed?.lez_varning ?? false;
  const tillstandKravs = parsed?.['tillstånd_krävs'] ?? parsed?.tillstand_kravs ?? false;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', ...DOT_BG }}>

      <Sidebar activePage={activePage} onNavigate={handleNavigate} company={company} onLogout={logout} userRole={user?.role} />

      {/* ── Right side ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar fuelPrice={fuelPrice} weather={weather} roadAlerts={roadAlerts} company={company} />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activePage === 'dashboard' && (
            <Dashboard
              quotes={quotes}
              fuelPrice={fuelPrice}
              roadAlerts={roadAlerts}
              onNewQuote={() => setShowNewQuote(true)}
            />
          )}
          {activePage === 'lonsamhet' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Profitability />
            </div>
          )}
          {activePage === 'settings' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Settings onFortnoxResult={fortnoxResult} />
            </div>
          )}
          {activePage === 'fleet' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <Fleet />
            </div>
          )}
          {activePage === 'jobs' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <Jobs />
            </div>
          )}
          {activePage === 'customers' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <Customers />
            </div>
          )}
          {activePage === 'audit' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <Audit />
            </div>
          )}
          {activePage === 'dataprivacy' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <DataPrivacy />
            </div>
          )}
        </div>
      </div>

      {/* ── New Quote overlay ────────────────────────────────────────── */}
      {showNewQuote && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: BG,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Overlay top bar */}
          <div style={{
            height: 56, flexShrink: 0,
            background: WHITE, borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LogoMark size={26} />
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 600, fontFamily: INTER }}>
                {t.newQuote.title}
              </span>
            </div>
            <button
              onClick={() => setShowNewQuote(false)}
              style={{
                background: 'none', border: `1px solid ${BORDER}`,
                borderRadius: 8, color: MUTED,
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Three-column grid */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '35fr 35fr 30fr',
            overflow: 'hidden',
            minHeight: 0,
          }}>

            {/* Left: Inquiry input */}
            <div className="panel-col">
              <span className="col-heading">{t.newQuote.colInquiry}</span>

              {/* Template strip */}
              {templates.length > 0 && (
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    overflowX: 'auto', paddingBottom: 2,
                  }}>
                    {templates.slice(0, 6).map((tpl) => {
                      const label = [
                        tpl.lasttyp,
                        [tpl.upphämtning, tpl.leverans].filter(Boolean).join('→'),
                      ].filter(Boolean).join(' · ') || tpl.name;
                      return (
                        <button
                          key={tpl.id}
                          onClick={() => handleLoadTemplate(tpl)}
                          title={tpl.name}
                          style={{
                            fontFamily: INTER, fontSize: '0.6875rem',
                            color: BLUE, background: WHITE,
                            border: `1.5px solid ${BORDER}`, borderRadius: 100,
                            padding: '4px 12px', cursor: 'pointer',
                            whiteSpace: 'nowrap', flexShrink: 0,
                            fontWeight: 500,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                    {templates.length > 6 && (
                      <button
                        onClick={() => setShowMallManager(true)}
                        style={{
                          fontFamily: INTER, fontSize: '0.6875rem',
                          color: MUTED, background: 'none',
                          border: `1px solid ${BORDER}`, borderRadius: 100,
                          padding: '4px 10px', cursor: 'pointer',
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        {t.newQuote.moreTemplates(templates.length - 6)}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowMallManager(true)}
                    style={{
                      fontFamily: INTER, fontSize: '0.5rem', letterSpacing: '0.04em',
                      background: 'none', border: 'none', padding: 0,
                      color: MUTED, cursor: 'pointer', textAlign: 'left',
                      textDecoration: 'underline', textDecorationColor: BORDER,
                    }}
                  >
                    {t.newQuote.manageTemplates}
                  </button>
                </div>
              )}
              {templates.length === 0 && (
                <button
                  onClick={() => setShowMallManager(true)}
                  style={{
                    fontFamily: INTER, fontSize: '0.5rem', letterSpacing: '0.04em',
                    background: 'none', border: 'none', padding: 0,
                    color: MUTED, cursor: 'pointer', textAlign: 'left',
                    textDecoration: 'underline', textDecorationColor: BORDER,
                    flexShrink: 0,
                  }}
                >
                  {t.newQuote.manageTemplates}
                </button>
              )}

              <InquiryInput
                onAnalyse={analyse}
                loading={status === 'streaming'}
                apiError={status === 'error' ? error : null}
                isOnline={isOnline}
              />
            </div>

            {/* Center: Analysis + actions */}
            <div className="panel-col">
              <span className="col-heading">{t.newQuote.colAnalysis}</span>

              <AnalysisStream
                status={status}
                rawText={rawText}
                parsed={parsed}
                error={error}
                confidence={confidence}
                originalParsed={originalParsed}
                lowApproved={lowApproved}
                onApprove={handleApprove}
                onFieldChange={status === 'done' ? setField : null}
                routeLive={routeLive}
                routeLoading={routeLoading}
              />

              {status === 'done' && parsed && (
                <>
                  {/* Pricing Intelligence — only when we have cargo type + a real price */}
                  {parsed.lasttyp && Number(parsed.totalpris_sek) > 0 && (
                    <PricingIntelligencePanel
                      lasttyp={String(parsed.lasttyp)}
                      currentPrice={Number(parsed.totalpris_sek)}
                      onApplyPrice={(price) => setField('totalpris_sek', price)}
                    />
                  )}

                  {/* Route advisory — road conditions + recommendations */}
                  {routeAdvisory && (
                    <div style={{
                      flexShrink: 0,
                      background: '#fafafa',
                      border: `1px solid ${routeAdvisory.route_alerts?.length > 0 ? '#fca5a5' : '#d1fae5'}`,
                      borderRadius: 8, padding: '10px 12px',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={12} color={routeAdvisory.route_alerts?.length > 0 ? '#dc2626' : '#15803d'} />
                        <span style={{ fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 700, color: TEXT }}>
                          {t.newQuote.routeAdvisory.heading}
                        </span>
                        {routeAdvisory.distance_km && (
                          <span style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED, marginLeft: 4 }}>
                            {t.newQuote.routeAdvisory.distanceTime(routeAdvisory.distance_km, routeAdvisory.duration_min)}
                          </span>
                        )}
                      </div>

                      {routeAdvisory.route_alerts?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {routeAdvisory.route_alerts.slice(0, 3).map((a) => (
                            <div key={a.id} style={{ fontFamily: INTER, fontSize: '0.625rem', color: '#dc2626', paddingLeft: 18 }}>
                              <strong>{a.road}</strong> {a.location} — {a.condition}
                              {a.warnings?.length > 0 && ` (${a.warnings.join(', ')})`}
                            </div>
                          ))}
                          {routeAdvisory.route_alerts.length > 3 && (
                            <div style={{ fontFamily: INTER, fontSize: '0.5625rem', color: MUTED, paddingLeft: 18 }}>
                              +{routeAdvisory.route_alerts.length - 3} till…
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 18 }}>
                        {routeAdvisory.recommendations?.map((rec, i) => (
                          <div key={i} style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED, lineHeight: 1.5 }}>
                            • {rec}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Route map — ORS HGV routing + Trafikverket disruptions */}
                  {(routeData || routeLoading) && (
                    <RouteMap routeData={routeData} loading={routeLoading} />
                  )}

                  {lezVarning && (
                    <div style={{
                      flexShrink: 0,
                      background: 'var(--lez-bg)', border: '1px solid rgba(231,76,60,0.2)',
                      borderRadius: 8, padding: '8px 12px',
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                    }}>
                      <span style={{ fontSize: '0.875rem', flexShrink: 0, lineHeight: 1.4 }}>⚠</span>
                      <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: 'var(--lez-text)', lineHeight: 1.5 }}>
                        {t.newQuote.banners.lez}
                      </span>
                    </div>
                  )}

                  {tillstandKravs && (
                    <div style={{
                      flexShrink: 0,
                      background: 'var(--tillstand-bg)', border: '1px solid var(--accent-blue-mid)',
                      borderRadius: 8, padding: '8px 12px',
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                    }}>
                      <span style={{ fontSize: '0.875rem', flexShrink: 0, lineHeight: 1.4 }}>⚡</span>
                      <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: 'var(--tillstand-text)', lineHeight: 1.5 }}>
                        {t.newQuote.banners.tillstand}
                      </span>
                    </div>
                  )}

                  {quoteNumber && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED }}>
                        {t.newQuote.quotePrefix}&nbsp;{quoteNumber}
                      </span>
                      {shareToken && (
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/quote/${shareToken}`;
                            navigator.clipboard.writeText(url)
                              .then(() => setToast({ message: t.newQuote.copyLink, variant: 'success' }))
                              .catch(() => setToast({ message: t.newQuote.copyLinkError, variant: 'error' }));
                          }}
                          style={{
                            fontFamily: INTER, fontSize: '0.5625rem', fontWeight: 500,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            background: WHITE, color: MUTED,
                            border: `1px solid ${BORDER}`, borderRadius: 6,
                            padding: '4px 8px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}
                          title={`${window.location.origin}/quote/${shareToken}`}
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                            <path d="M7 1H10V4M10 1L5.5 5.5M4.5 2H2C1.45 2 1 2.45 1 3V9C1 9.55 1.45 10 2 10H8C8.55 10 9 9.55 9 9V6.5"
                              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          {t.newQuote.shareLink}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pending-approval hint — low/none fields not yet resolved */}
                  {lowConfidenceKeys.length > 0 && !allLowResolved && (
                    <div style={{
                      flexShrink: 0,
                      fontFamily: INTER, fontSize: '0.5625rem',
                      color: '#f59e0b', letterSpacing: '0.04em', lineHeight: 1.5,
                      padding: '6px 10px',
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 8,
                    }}>
                      {t.newQuote.flags.editOrConfirm}
                    </div>
                  )}

                  {/* Low-confidence banner — requires explicit dispatcher acknowledgment */}
                  {belowThreshold && allLowResolved && !reviewAcknowledged && (
                    <div style={{
                      flexShrink: 0,
                      padding: '10px 12px',
                      background: 'rgba(245,158,11,0.06)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: 8,
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{
                        fontFamily: INTER, fontSize: '0.5625rem', color: '#f59e0b',
                        letterSpacing: '0.04em', lineHeight: 1.55,
                      }}>
                        {t.newQuote.flags.lowConfidence}
                      </div>
                      <div style={{
                        fontFamily: INTER, fontSize: '0.5rem', color: MUTED,
                        letterSpacing: '0.02em',
                      }}>
                        {t.newQuote.flags.overallScore(Math.round(confidenceOverall * 100))}
                      </div>
                      <button
                        onClick={() => setReviewAcknowledged(true)}
                        style={{
                          alignSelf: 'flex-start',
                          fontFamily: INTER, fontSize: '0.5625rem', fontWeight: 500,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          background: 'rgba(245,158,11,0.12)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245,158,11,0.35)',
                          borderRadius: 6, padding: '5px 12px',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.22)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; }}
                      >
                        {t.newQuote.flags.reviewBtn}
                      </button>
                    </div>
                  )}

                  {/* Acknowledged badge */}
                  {belowThreshold && reviewAcknowledged && (
                    <div style={{
                      flexShrink: 0,
                      fontFamily: INTER, fontSize: '0.5rem', color: '#2ecc71',
                      letterSpacing: '0.04em', padding: '4px 0',
                    }}>
                      {t.newQuote.flags.reviewAcknowledged}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={handleSave}
                      disabled={saving || !canSave}
                      title={!allLowResolved ? t.newQuote.flags.confirmFields : belowThreshold && !reviewAcknowledged ? t.newQuote.flags.reviewFirst : undefined}
                      style={{
                        flex: 1, fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: canSave
                          ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                          : '#e9ecef',
                        color: canSave ? WHITE : MUTED,
                        border: 'none',
                        borderRadius: 8, padding: '11px 14px',
                        cursor: (saving || !canSave) ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.55 : 1,
                        transition: 'opacity 0.15s',
                        boxShadow: canSave ? '0 1px 4px rgba(99,102,241,0.22)' : 'none',
                      }}
                      onMouseEnter={(e) => { if (canSave && !saving) e.currentTarget.style.opacity = '0.88'; }}
                      onMouseLeave={(e) => { if (canSave && !saving) e.currentTarget.style.opacity = '1'; }}
                    >
                      {saving ? t.newQuote.saving : t.newQuote.confirmQuote}
                    </button>
                    <button
                      onClick={handleExport}
                      style={{
                        flexShrink: 0, fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: WHITE, color: '#374151',
                        border: `1.5px solid ${BORDER}`, borderRadius: 8,
                        padding: '11px 14px', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = BLUE; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = '#374151'; }}
                    >
                      {t.newQuote.exportPdf}
                    </button>
                  </div>

                  <button
                    onClick={openMallModal}
                    style={{
                      flexShrink: 0, fontFamily: INTER, fontSize: '0.5625rem', fontWeight: 500,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: WHITE, color: MUTED,
                      border: `1.5px solid ${BORDER}`, borderRadius: 8,
                      padding: '7px 14px', cursor: 'pointer',
                    }}
                  >
                    {t.newQuote.saveAsTemplate}
                  </button>

                </>
              )}
            </div>

            {/* Right: Fleet + history */}
            <div className="panel-col">
              <span className="col-heading">{t.newQuote.colFleet}</span>
              <FleetPanel fleet={fleet} />

              {drivers.length > 0 && (
                <>
                  <span className="col-heading" style={{ marginTop: 6 }}>{t.newQuote.colDrivers}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    {drivers.map((d) => (
                      <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, padding: '6px 0', borderBottom: `1px solid ${BORDER}`,
                      }}>
                        <span style={{ fontFamily: INTER, fontSize: '0.75rem', color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.name}
                        </span>
                        <span style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.06em', color: BLUE, flexShrink: 0 }}>
                          {d.truck_id}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <span className="col-heading" style={{ marginTop: 6 }}>{t.newQuote.colHistory}</span>
              <div className="history-list">
                {quotes.length === 0 ? (
                  <p style={{
                    fontFamily: INTER, fontSize: '0.6875rem', color: MUTED,
                    margin: '24px 0', textAlign: 'center', lineHeight: 1.6, fontStyle: 'italic',
                  }}>
                    {t.newQuote.noHistory}
                  </p>
                ) : (
                  quotes.map((q) => (
                    <div key={q.id} style={{
                      padding: '9px 0', borderBottom: `1px solid #f0f2f5`,
                      cursor: 'default',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f9fa'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontFamily: INTER, fontSize: '0.8125rem', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {q.lasttyp ?? '—'}
                        </span>
                        <span style={{ fontFamily: INTER, fontSize: '0.8125rem', fontWeight: 600, color: BLUE, flexShrink: 0 }}>
                          {fmtSEK(q.totalpris_sek)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: INTER, fontSize: '0.625rem', letterSpacing: '0.04em', color: MUTED, flexShrink: 0 }}>
                          {q.id}
                        </span>
                        {q.token && (
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/quote/${q.token}`;
                              navigator.clipboard.writeText(url)
                                .then(() => setToast({ message: t.newQuote.copyLink, variant: 'success' }))
                                .catch(() => setToast({ message: t.newQuote.copyLinkError, variant: 'error' }));
                            }}
                            title={`${window.location.origin}/quote/${q.token}`}
                            style={{
                              background: 'none', border: 'none', padding: '1px 3px',
                              cursor: 'pointer', color: MUTED,
                              display: 'flex', alignItems: 'center', flexShrink: 0,
                              borderRadius: 4, lineHeight: 1,
                            }}
                          >
                            <svg width="9" height="9" viewBox="0 0 11 11" fill="none" aria-hidden>
                              <path d="M7 1H10V4M10 1L5.5 5.5M4.5 2H2C1.45 2 1 2.45 1 3V9C1 9.55 1.45 10 2 10H8C8.55 10 9 9.55 9 9V6.5"
                                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => openMallModalFromQuote(q)}
                          title={t.newQuote.saveAsTemplate}
                          style={{
                            fontFamily: INTER, fontSize: '0.5rem', letterSpacing: '0.04em',
                            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 4,
                            color: MUTED, cursor: 'pointer', padding: '2px 5px',
                            flexShrink: 0, whiteSpace: 'nowrap',
                          }}
                        >
                          {t.newQuote.addMall}
                        </button>
                        {/* Message notification dot */}
                        {(q.msg_count > 0 || q.co_pending > 0) && (
                          <button
                            onClick={() => setMsgQuote({ rawId: q.rawId, id: q.id, lasttyp: q.lasttyp })}
                            title={`${q.msg_count} meddelande${q.msg_count !== 1 ? 'n' : ''}${q.co_pending > 0 ? ' · motbud inväntar' : ''}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                              background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
                              borderRadius: 4,
                            }}
                          >
                            <span style={{
                              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                              background: q.co_pending > 0 ? BLUE : '#f59e0b',
                              flexShrink: 0,
                              animation: q.co_pending > 0 ? 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite' : 'none',
                            }} />
                            {q.msg_count > 0 && (
                              <span style={{ fontFamily: INTER, fontSize: '0.4375rem', color: '#f59e0b', letterSpacing: '0.04em' }}>
                                {q.msg_count}
                              </span>
                            )}
                          </button>
                        )}
                        <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, marginLeft: 'auto', flexShrink: 0 }}>
                          {fmtDate(q.created_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Spara som mall modal ─────────────────────────────────────────── */}
      {mallModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: 28, width: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: MUTED, marginBottom: 16 }}>
              {t.newQuote.templateModal.heading}
            </div>
            <label style={{ display: 'block', marginBottom: 22 }}>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                {t.newQuote.templateModal.nameLabel}
              </div>
              <input
                autoFocus
                value={mallModal.name}
                onChange={(e) => setMallModal({ name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveMall(); if (e.key === 'Escape') setMallModal(null); }}
                style={{
                  width: '100%', fontFamily: INTER, fontSize: '0.875rem', color: TEXT,
                  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px',
                  outline: 'none', boxSizing: 'border-box', background: BG,
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMallModal(null)}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', padding: '9px 18px',
                  border: `1.5px solid ${BORDER}`, borderRadius: 8,
                  background: WHITE, color: MUTED, cursor: 'pointer',
                }}
              >
                {t.newQuote.templateModal.cancel}
              </button>
              <button
                onClick={handleSaveMall}
                disabled={!mallModal.name.trim()}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', fontWeight: 600, padding: '9px 18px',
                  border: 'none', borderRadius: 8,
                  background: mallModal.name.trim() ? BLUE : '#e9ecef',
                  color: mallModal.name.trim() ? WHITE : MUTED,
                  cursor: mallModal.name.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {t.newQuote.templateModal.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mall manager modal ───────────────────────────────────────────── */}
      {showMallManager && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: 12, width: 460, maxHeight: '78vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 24px 14px', borderBottom: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: MUTED }}>
                {t.newQuote.templateManager.heading}{templates.length > 0 ? ` (${templates.length})` : ''}
              </span>
              <button
                onClick={() => setShowMallManager(false)}
                style={{ fontFamily: INTER, fontSize: '0.875rem', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {templates.length === 0 ? (
                <div style={{ fontFamily: INTER, fontSize: '0.8125rem', color: MUTED, textAlign: 'center', padding: '36px 24px', fontStyle: 'italic' }}>
                  {t.newQuote.templateManager.empty}
                </div>
              ) : (
                templates.map((tpl, i) => (
                  <div key={tpl.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 24px',
                    borderBottom: i < templates.length - 1 ? `1px solid ${BORDER}` : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: INTER, fontSize: '0.8125rem', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tpl.name}
                      </div>
                      <div style={{ fontFamily: INTER, fontSize: '0.5625rem', color: MUTED, marginTop: 2 }}>
                        {[
                          tpl.lasttyp,
                          tpl.fordon_id,
                          tpl.base_price_sek != null
                            ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(tpl.base_price_sek) + ' kr'
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      style={{
                        fontFamily: INTER, fontSize: '0.625rem', letterSpacing: '0.04em',
                        background: '#fff0f0', border: '1.5px solid #fca5a5', borderRadius: 6,
                        color: '#e74c3c', cursor: 'pointer', padding: '4px 9px', flexShrink: 0,
                      }}
                    >
                      {t.newQuote.templateManager.delete}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '12px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowMallManager(false)}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', padding: '8px 20px',
                  border: `1.5px solid ${BORDER}`, borderRadius: 8,
                  background: WHITE, color: MUTED, cursor: 'pointer',
                }}
              >
                {t.newQuote.templateManager.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Message / counter-offer panel ───────────────────────────── */}
      {msgQuote && (
        <MessagePanel
          rawId={msgQuote.rawId}
          quoteId={msgQuote.id}
          quoteLabel={msgQuote.lasttyp}
          onClose={() => setMsgQuote(null)}
        />
      )}

      {toast && <Toast message={toast.message ?? toast} variant={toast.variant ?? 'success'} onDismiss={dismissToast} />}

      {/* DPA modal — shown on first login until accepted */}
      {!dpaAccepted && (
        <DpaModal onAccepted={(accepted_at) => {
          setDpaAccepted(true);
          updateCompany({ ...company, dpa_accepted_at: accepted_at });
        }} />
      )}

      <TourOverlay />
    </div>
  );
}

// ─── Subscription paused screen ──────────────────────────────────────────────
function SubscriptionPaused({ company, onLogout }) {
  const { t } = useLanguage();
  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: INTER, padding: 24,
    }}>
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16,
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
        padding: '48px 40px', maxWidth: 440, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, background: 'rgba(231,76,60,0.08)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <span style={{ fontSize: 22 }}>⏸</span>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: '0 0 10px' }}>
          {t.subscriptionPaused.heading}
        </h1>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 28px', lineHeight: 1.7 }}>
          {t.subscriptionPaused.desc}
        </p>
        <a
          href={`mailto:admin@akaren.se?subject=${encodeURIComponent(t.subscriptionPaused.heading + ' — ' + (company?.name ?? ''))}`}
          style={{
            display: 'inline-block', background: BLUE, color: WHITE,
            fontFamily: INTER, fontSize: 13, fontWeight: 600,
            padding: '10px 24px', borderRadius: 8, textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          {t.subscriptionPaused.contact}
        </a>
        <div>
          <button
            onClick={onLogout}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: INTER, fontSize: 12, color: MUTED,
            }}
          >
            {t.subscriptionPaused.logOut}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Error boundary — surfaces render crashes instead of blank screen ─────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          color: '#e74c3c', padding: 32, fontFamily: "'Inter', sans-serif",
          background: BG, minHeight: '100vh', whiteSpace: 'pre-wrap',
        }}>
          <div style={{ fontSize: 14, marginBottom: 16, color: TEXT }}>Render error</div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>{this.state.error.message}</div>
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── ToS acceptance gate ──────────────────────────────────────────────────────
function TosGate({ onAccepted }) {
  const { token, company } = useAuth();
  const [checked,  setChecked]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  async function handleAccept() {
    if (!checked || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/accept-tos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Kunde inte spara godkännande');
      const data = await res.json();
      onAccepted({ tos_accepted_at: data.tos_accepted_at });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const INDIGO = '#6366f1';

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f6fa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600,
        boxShadow: '0 4px 32px rgba(0,0,0,0.10)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          padding: '28px 32px 24px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 8 }}>
            ÅKAREN · JURIDISKA VILLKOR
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            Godkänn villkoren för att fortsätta
          </div>
          <div style={{ fontSize: 13, color: '#c7d2fe', lineHeight: 1.5 }}>
            Innan du kan använda plattformen behöver{company?.name ? ` ${company.name}` : ''} godkänna
            Allmänna Villkoren och Personuppgiftsbiträdesavtalet.
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ padding: '24px 32px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              icon: '📄',
              title: 'Allmänna Villkor (ToS)',
              points: [
                'Abonnemang faktureras månadsvis i förskott, 30 dagars netto',
                'En månads ömsesidig uppsägningstid',
                'Åkarens ansvar är begränsat till 3 månaders avgifter',
                'AI-analys är beslutsstöd — ni godkänner offerter',
              ],
            },
            {
              icon: '🔒',
              title: 'Personuppgiftsbiträdesavtal (GDPR art. 28)',
              points: [
                'Åkaren behandlar personuppgifter för er räkning',
                'Data lagras inom EU (Hetzner, Frankfurt)',
                'AI-behandling under EU-standardavtalsklausuler (SCC)',
                'Data raderas inom 30 dagar efter avtalets upphörande',
              ],
            },
          ].map(({ icon, title, points }) => (
            <div key={title} style={{
              border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px',
              background: '#f9fafb',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 10 }}>
                {icon}  {title}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {points.map((p) => (
                  <li key={p} style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Checkbox + CTA */}
        <div style={{ padding: '20px 32px 28px' }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 18,
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: INDIGO, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>
              Jag har läst och godkänner Åkarens{' '}
              <strong>Allmänna Villkor</strong> och{' '}
              <strong>Personuppgiftsbiträdesavtal</strong> (version 2026-05-17).
              Godkännandet gäller för hela organisationen.
            </span>
          </label>

          {error && (
            <div style={{
              marginBottom: 14, padding: '9px 14px', borderRadius: 7,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
              fontSize: 12, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 9, border: 'none',
              background: checked
                ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                : '#e5e7eb',
              color: checked ? '#fff' : '#9ca3af',
              fontFamily: "'Inter', sans-serif",
              fontSize: 14, fontWeight: 700, cursor: checked ? 'pointer' : 'default',
              letterSpacing: '0.02em',
              boxShadow: checked ? '0 2px 8px rgba(99,102,241,0.30)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Sparar…' : 'Godkänn och fortsätt'}
          </button>

          <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
            Du kan ladda ner båda dokumenten som PDF under Inställningar → Juridik & Avtal.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Auth gate — keeps hook count stable across auth transitions ─────────────
function AppShell() {
  const { isAuthenticated, user, company, logout, updateCompany, updateUser } = useAuth();
  if (!isAuthenticated) return <Login />;
  if (company?.active === 0 || company?.active === false) {
    return <SubscriptionPaused company={company} onLogout={logout} />;
  }
  if (!company?.onboarding_completed_at) {
    return <Onboarding onComplete={updateCompany} />;
  }
  if (!user?.tos_accepted_at) {
    return <TosGate onAccepted={updateUser} />;
  }
  return <AppInner />;
}

// ─── Default export — wraps inner app with auth + sync contexts ──────────────
export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <ErrorBoundary>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AuthProvider>
        <SyncProvider>
          <AppShell />
        </SyncProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
