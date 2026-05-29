import { useState, useCallback, useEffect, useRef, useMemo, Component } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
import {
  LayoutDashboard, FilePlus, Briefcase, Truck, TrendingUp,
  Settings as SettingsIcon, LogOut, Bell, Search, X, DollarSign, FileText,
  AlertTriangle, Fuel, Shield, Lock, Users, Leaf, CalendarDays, ScrollText, Network, CreditCard, Wrench,
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
import { RouteMap }               from './components/RouteMap.jsx';
import { VehicleComparisonPanel } from './components/VehicleComparisonPanel.jsx';
import { Customers }      from './pages/Customers.jsx';
import { Co2 }            from './pages/Co2.jsx';
import { Onboarding }     from './pages/Onboarding.jsx';
import { Dispatch }       from './pages/Dispatch.jsx';
import { DriverView }     from './pages/DriverView.jsx';
import { Kortider }          from './pages/Kortider.jsx';
import { Upphandlingar }     from './pages/Upphandlingar.jsx';
import Natverk               from './pages/Natverk.jsx';
import Drivmedel             from './pages/Drivmedel.jsx';
import Underhall             from './pages/Underhall.jsx';
import { SetupAccount }   from './pages/SetupAccount.jsx';
import { TourOverlay }    from './components/TourOverlay.jsx';
import { SubscriptionGate } from './components/SubscriptionGate.jsx';
import { SplashScreen }  from './components/SplashScreen.jsx';
import { LogoFull, LogoMark } from './assets/Logo.jsx';
import { useAnalysis }   from './hooks/useAnalysis.js';
import { generatePdf }    from './utils/generatePdf.js';
import { apiFetch }       from './utils/apiFetch.js';
import { syncPricingInsights } from './db/sync.js';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SyncProvider, useSync } from './context/SyncContext.jsx';
import { LanguageProvider, useLanguage } from './context/LanguageContext.jsx';
import { db }             from './db/dexie.js';

// ─── Design tokens — clean light premium ─────────────────────────────────────
const BG_BASE   = '#f4f5f7';
const SURF      = '#ffffff';
const SURF_SOFT = '#fafbfc';
const SURF_ELV  = '#f0f2f5';
const SURF_SOLID = '#ffffff';
const BORDER    = '#ececef';
const BORDER_ST = '#dde0e5';
const TEXT_PR   = '#1a1d24';
const TEXT_SEC  = '#6b7280';
const TEXT_MU   = '#9ca3af';
const ACCENT    = '#2d3340';   // dark slate — primary buttons + active states
const ACCENT_SF = '#eef0f3';   // accent-soft background
const ICON_BG   = '#eef1f5';   // icon container tint
const INTER     = "'Geist', system-ui, sans-serif";
const MONO      = "'Geist Mono', monospace";

// Semantic colours
const D_GREEN = '#16a34a';
const D_RED   = '#dc2626';
const D_AMBER = '#b56510';
const D_BLUE  = '#2563eb';

// Shadows — soft only
const SHADOW_SM   = '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)';
const SHADOW_CARD = '0 1px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06)';

// Aliases — keep compatibility with existing inline styles
const OUTFIT      = INTER;
const WHITE       = '#ffffff';
const TEXT        = TEXT_PR;
const MUTED       = TEXT_SEC;
const FAINT       = TEXT_MU;
const CYAN        = '#2563eb';
const CYAN_BR     = '#1d4ed8';
const BLUE_ACC    = '#2563eb';
const SUCCESS     = D_GREEN;
const WARNING_C   = D_AMBER;
const DANGER      = D_RED;
const AMBER       = D_AMBER;
const BLUE        = D_BLUE;
const BLUE_DK     = '#1d4ed8';
const AMBER_LT    = D_AMBER;
const AMBER_DK    = '#92400e';
const BORDER_GLOW = BORDER;
const VIOLET      = '#7c3aed';
const DARK        = ACCENT;
const DARK_SURF   = '#1a1d24';
const DARK_SURF2  = '#2d3340';
const DARK_BDR    = 'rgba(255,255,255,0.10)';
const GREEN_LIVE  = D_GREEN;
const SAGE        = D_GREEN;
const SAGE_DIM    = '#15803d';
const TERRA       = D_AMBER;
const SLATE_A     = D_BLUE;
const AMBER_C     = D_AMBER;
const MAUVE_C     = VIOLET;
const CORAL_C     = D_RED;
const NOISE_URI   = '';

const glassCard = {
  background: SURF,
  border: `1px solid ${BORDER}`,
  borderRadius: 20,
  boxShadow: SHADOW_SM,
};

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

// ─── Live dashboard helpers ───────────────────────────────────────────────────
function fmtTimeAgo(isoStr, t) {
  const ms   = Date.now() - new Date(String(isoStr).replace(' ', 'T')).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1)  return t.topbar.timeAgo.justNow;
  if (mins < 60) return t.topbar.timeAgo.mins(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return t.topbar.timeAgo.hours(hrs);
  return t.topbar.timeAgo.days(Math.floor(hrs / 24));
}

function buildRevenueData(quotes) {
  const now    = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: d.toLocaleDateString('sv-SE', { month: 'short' }),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      value: 0,
    };
  });
  for (const q of quotes) {
    if (!q.created_at || !q.totalpris_sek) continue;
    const key = String(q.created_at).slice(0, 7);
    const m   = months.find((mo) => mo.key === key);
    if (m) m.value += Number(q.totalpris_sek) || 0;
  }
  return months.map(({ month, value }) => ({ month, value }));
}

function buildActivity(quotes, t) {
  const sorted = [...quotes]
    .sort((a, b) => new Date(String(b.created_at).replace(' ', 'T')) - new Date(String(a.created_at).replace(' ', 'T')))
    .slice(0, 5);
  return sorted.map((q) => {
    const route = [q.upphämtning, q.leverans].filter(Boolean).join(' – ') || q.lasttyp || '—';
    const isJob = q.status === 'godkänd' || q.status === 'aktiv' || q.status === 'avslutad';
    return {
      dot:  isJob ? '#2ecc71' : AMBER,
      text: isJob ? t.dashboard.activity.jobSaved : t.dashboard.activity.quoteCreated,
      sub:  route,
      time: fmtTimeAgo(q.created_at, t),
    };
  });
}

// Roles that can access each nav item
const NAV_ROLES = {
  dashboard:  ['agare', 'trafikledare', 'ekonomi', 'revisor'],
  'new-quote':['agare', 'trafikledare'],
  operations: ['agare', 'trafikledare', 'ekonomi', 'revisor'],
  fleet:      ['agare', 'trafikledare'],
  settings:   ['agare', 'trafikledare', 'ekonomi', 'revisor'],
  kortider:        ['agare', 'trafikledare'],
  upphandlingar:   ['agare', 'trafikledare'],
  natverk:         ['agare', 'trafikledare'],
  drivmedel:       ['agare', 'trafikledare'],
  underhall:       ['agare', 'trafikledare'],
};

function getNavItems(t, role) {
  const all = [
    { id: 'dashboard',   label: t.nav.dashboard,    Icon: LayoutDashboard, group: 'main' },
    { id: 'new-quote',   label: t.nav.newQuote,     Icon: FilePlus,        group: 'main' },
    { id: 'operations',  label: t.nav.operations,   Icon: Briefcase,       group: 'main' },
    { id: 'fleet',       label: t.nav.fleet,        Icon: Truck,           group: 'main' },
    { id: 'settings',    label: t.nav.settings,     Icon: SettingsIcon,    group: 'main' },
    { id: 'kortider',      label: t.nav.kortider,      Icon: Shield,      group: 'compliance' },
    { id: 'upphandlingar', label: t.nav.upphandlingar, Icon: ScrollText,  group: 'compliance' },
    { id: 'natverk',       label: t.nav.natverk,       Icon: Network,     group: 'network' },
    { id: 'drivmedel',     label: t.nav.drivmedel,     Icon: CreditCard,  group: 'network' },
    { id: 'underhall',     label: t.nav.underhall,     Icon: Wrench,      group: 'network' },
  ];
  return all.filter((n) => !role || (NAV_ROLES[n.id] ?? []).includes(role));
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
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: isActive ? ACCENT_SF : hovered ? '#f5f6f8' : 'transparent',
        border: 'none',
        borderRadius: 10,
        color: isActive ? ACCENT : hovered ? TEXT_PR : TEXT_SEC,
        fontSize: 11, fontFamily: INTER, fontWeight: isActive ? 600 : 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 120ms ease',
        lineHeight: 1.3,
        marginBottom: 2,
      }}
    >
      <Icon size={14} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </button>
  );
}

const DOT_BG = { background: 'transparent' };

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, company, onLogout, userRole, mobileOpen, onMobileClose }) {
  const { t } = useLanguage();
  const allItems        = getNavItems(t, userRole);
  const mainItems       = allItems.filter((n) => n.group === 'main');
  const complianceItems = allItems.filter((n) => n.group === 'compliance');
  const networkItems    = allItems.filter((n) => n.group === 'network');
  return (
    <>
      {mobileOpen && (
        <div className="mobile-backdrop" onClick={onMobileClose} aria-hidden />
      )}
      <aside className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`} style={{
        width: 232, flexShrink: 0,
        background: BG_BASE,
        padding: '12px',
        display: 'flex', flexDirection: 'column',
        height: '100vh',
        boxSizing: 'border-box',
      }}>
        {/* Floating card */}
        <div style={{
          flex: 1, background: SURF,
          borderRadius: 20, boxShadow: SHADOW_CARD,
          border: `1px solid ${BORDER}`,
          display: 'flex', flexDirection: 'column',
          padding: '20px 12px 16px',
          overflow: 'hidden',
        }}>
          {/* Logo */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 4px', marginBottom: 28, flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: INTER, letterSpacing: '-0.02em' }}>Å</span>
            </div>
            <div>
              <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 14, color: TEXT_PR, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Åkaren
              </div>
              <div style={{ fontSize: 8, color: TEXT_MU, fontFamily: INTER, marginTop: 1, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                {t.sidebar.tagline}
              </div>
            </div>
          </div>

          {/* Main nav */}
          <nav style={{ flex: 1, padding: '0 0 10px', overflowY: 'auto' }}>
            {mainItems.map(({ id, label, Icon }) => (
              <NavItem
                key={id}
                id={id}
                label={label}
                Icon={Icon}
                isActive={activePage === id}
                onClick={() => onNavigate(id)}
              />
            ))}

            {/* Compliance section */}
            {complianceItems.length > 0 && (
              <>
                <div style={{
                  fontSize: 9, fontFamily: INTER, fontWeight: 700,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: TEXT_MU, padding: '16px 12px 6px',
                }}>
                  {t.sidebar.compliance}
                </div>
                {complianceItems.map(({ id, label, Icon }) => (
                  <NavItem
                    key={id}
                    id={id}
                    label={label}
                    Icon={Icon}
                    isActive={activePage === id}
                    onClick={() => onNavigate(id)}
                  />
                ))}
              </>
            )}

            {/* Network section */}
            {networkItems.length > 0 && (
              <>
                <div style={{
                  fontSize: 9, fontFamily: INTER, fontWeight: 700,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: TEXT_MU, padding: '16px 12px 6px',
                }}>
                  {t.sidebar.network}
                </div>
                {networkItems.map(({ id, label, Icon }) => (
                  <NavItem
                    key={id}
                    id={id}
                    label={label}
                    Icon={Icon}
                    isActive={activePage === id}
                    onClick={() => onNavigate(id)}
                  />
                ))}
              </>
            )}
          </nav>

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 4px 4px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: ACCENT_SF, border: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: INTER, fontSize: 10, fontWeight: 700, color: ACCENT,
              }}>
                {(company?.name ?? 'Å').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 500, color: TEXT_SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {company?.name ?? 'Åkaren'}
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                color: TEXT_MU, fontSize: 11, fontFamily: INTER,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 0', width: '100%', borderRadius: 5,
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_PR; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MU; }}
            >
              <LogOut size={12} strokeWidth={1.5} />
              <span>{t.nav.logOut}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── TopBar removed — search and language toggle are inlined in AppInner ──────



// ─── KpiCard ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, change, changeUp, accentColor, Icon: IconProp }) {
  return (
    <div style={{
      background: SURF,
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      padding: '18px 20px 20px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(28,25,23,0.05)',
      borderTop: `3px solid ${accentColor}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        {IconProp && (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${accentColor}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <IconProp size={15} color={accentColor} strokeWidth={1.5} />
          </div>
        )}
        {change && (
          <span style={{
            fontFamily: INTER, fontSize: 10, fontWeight: 600,
            color: changeUp ? D_GREEN : D_RED,
            background: changeUp ? 'rgba(58,148,104,0.10)' : 'rgba(184,60,60,0.10)',
            border: `1px solid ${changeUp ? 'rgba(58,148,104,0.22)' : 'rgba(184,60,60,0.22)'}`,
            padding: '2px 7px', borderRadius: 100, whiteSpace: 'nowrap', marginLeft: 'auto',
          }}>
            {changeUp ? '+' : ''}{change}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: TEXT_MU, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: MONO, fontFeatureSettings: '"tnum"', fontSize: 26, fontWeight: 700,
        color: TEXT_PR, letterSpacing: '-0.03em', lineHeight: 1,
        fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ quotes, fuelPrice, roadAlerts, onNewQuote, fleet = [] }) {
  const { t } = useLanguage();
  const [backhaulStats, setBackhaulStats] = useState(null);

  useEffect(() => {
    apiFetch('/api/backhaul/stats')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setBackhaulStats(d))
      .catch(() => {});
  }, []);

  const revenueData   = buildRevenueData(quotes);
  const activity      = buildActivity(quotes, t);
  const chartSubtitle = revenueData.length >= 2
    ? `${revenueData[0].month} – ${revenueData[revenueData.length - 1].month} ${new Date().getFullYear()}`
    : '';

  const todayStr    = new Date().toDateString();
  const yestStr     = new Date(Date.now() - 86400000).toDateString();
  const toDay       = (q) => new Date(String(q.created_at).replace(' ', 'T')).toDateString();
  const todayQ      = quotes.filter((q) => toDay(q) === todayStr);
  const yestQ       = quotes.filter((q) => toDay(q) === yestStr);
  const todayRev    = todayQ.reduce((s, q) => s + (Number(q.totalpris_sek) || 0), 0);
  const yestRev     = yestQ.reduce((s, q) => s + (Number(q.totalpris_sek) || 0), 0);
  const revPct      = yestRev > 0 ? Math.round((todayRev - yestRev) / yestRev * 100) : null;
  const quotesDelta = todayQ.length - yestQ.length;

  const totalRevenue = quotes.reduce((sum, q) => sum + (Number(q.totalpris_sek) || 0), 0);
  const dieselValue  = fuelPrice ? fmtPrice(fuelPrice.price_per_litre) + ' kr/L' : '—';
  const lezCount     = quotes.filter((q) => q.lez_varning).length;
  const lezPct       = quotes.length > 0 ? Math.round((quotes.length - lezCount) / quotes.length * 100) : 100;
  const displayQ     = quotes.slice(0, 6);
  const activeJobs   = quotes.filter((q) => q.status === 'aktiv' || q.status === 'planerad').length;

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '24px 28px',
      background: 'transparent',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 18, fontWeight: 700, color: TEXT_PR, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {t.dashboard.operationsTitle}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, marginTop: 3 }}>
            {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(58,148,104,0.08)', border: '1px solid rgba(58,148,104,0.22)',
            borderRadius: 7, padding: '6px 12px',
          }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: D_GREEN,
            }} />
            <span style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', color: D_GREEN }}>
              {t.dashboard.systemLive}
            </span>
          </div>
          <button
            onClick={onNewQuote}
            style={{
              background: TEXT_PR, color: SURF, border: 'none', borderRadius: 8,
              padding: '9px 18px', fontSize: 12, fontWeight: 600, fontFamily: INTER,
              letterSpacing: '0.03em', cursor: 'pointer',
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.82'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            + {t.dashboard.analyseBtn}
          </button>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard
          accentColor={ACCENT} Icon={DollarSign}
          label={t.dashboard.totalRevenue}
          value={totalRevenue > 0 ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(totalRevenue) + ' kr' : '—'}
          change={revPct != null ? `${Math.abs(revPct)}% ${t.dashboard.vsYesterday}` : null}
          changeUp={revPct != null && revPct >= 0}
        />
        <KpiCard
          accentColor={ACCENT} Icon={FileText}
          label={t.dashboard.quotes}
          value={String(quotes.length)}
          change={quotesDelta !== 0 ? `${Math.abs(quotesDelta)} ${t.dashboard.vsYesterday}` : null}
          changeUp={quotesDelta > 0}
        />
        <KpiCard
          accentColor={lezCount === 0 ? D_GREEN : D_RED} Icon={AlertTriangle}
          label={t.dashboard.lezCompliance}
          value={`${lezPct}%`}
          change={lezCount > 0 ? t.dashboard.lezWarnings(lezCount) : t.dashboard.lezApproved}
          changeUp={lezCount === 0}
        />
        <KpiCard
          accentColor={D_AMBER} Icon={Fuel}
          label={t.dashboard.dieselPrice}
          value={dieselValue}
          change={fuelPrice?.source !== 'fallback' ? 'LIVE' : null}
          changeUp={true}
        />
      </div>

      {/* ── Tomma mil / Backhaul panel ───────────────────────────────────────── */}
      {backhaulStats && backhaulStats.job_count > 0 && (
        <div style={{
          background: SURF,
          border: `1px solid rgba(181,101,16,0.22)`,
          borderRadius: 12, padding: '18px 22px',
          borderLeft: `4px solid ${D_AMBER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Truck size={14} color={D_AMBER} strokeWidth={1.5} />
              <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_PR }}>
                {t.tommaMillPanel.heading}
              </span>
              <span style={{
                fontFamily: INTER, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                color: D_AMBER, background: `${D_AMBER}18`, border: `1px solid ${D_AMBER}35`,
                borderRadius: 4, padding: '1px 6px',
              }}>
                {t.tommaMillPanel.badge}
              </span>
            </div>
            {backhaulStats.pair_count > 0 && (
              <span style={{ fontFamily: INTER, fontSize: 11, color: D_GREEN, fontWeight: 600 }}>
                {t.tommaMillPanel.pairCount(backhaulStats.pair_count)}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 14 }}>
            <div style={{ borderRight: `1px solid ${BORDER}`, paddingRight: 16 }}>
              <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: TEXT_MU, marginBottom: 4 }}>
                {t.tommaMillPanel.badge}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: D_AMBER, letterSpacing: '-0.03em', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                {t.tommaMillPanel.deadheadKm(backhaulStats.deadhead_km)}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, marginTop: 2 }}>
                {t.tommaMillPanel.deadheadSek(backhaulStats.deadhead_sek)}
              </div>
            </div>

            <div style={{ borderRight: `1px solid ${BORDER}`, paddingRight: 16 }}>
              <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: TEXT_MU, marginBottom: 4 }}>
                {t.tommaMillPanel.recoveredBy}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: D_GREEN, letterSpacing: '-0.03em', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                {t.tommaMillPanel.recoveredSek(backhaulStats.recovered_sek)}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, marginTop: 2 }}>
                {t.tommaMillPanel.recoveredKm(backhaulStats.recovered_km)}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: TEXT_MU, marginBottom: 4 }}>
                TOTAL KM
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: TEXT_PR, letterSpacing: '-0.03em', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                {backhaulStats.total_km.toLocaleString('sv-SE')} km
              </div>
              <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, marginTop: 2 }}>
                {backhaulStats.job_count} {backhaulStats.job_count === 1 ? 'job' : 'jobs'}
              </div>
            </div>
          </div>

          <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC, lineHeight: 1.5 }}>
            {t.tommaMillPanel.summary(backhaulStats.deadhead_km, backhaulStats.deadhead_sek, backhaulStats.recovered_sek)}
          </div>
        </div>
      )}

      {/* ── Middle row: chart + live events ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '62fr 38fr', gap: 16, minHeight: 300 }}>

        {/* Bar chart */}
        <div style={{ background: SURF, border: `1px solid \$\{BORDER\}`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PR, fontFamily: INTER }}>
              {t.dashboard.monthlyRevenue}
            </span>
            <span style={{
              fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
              color: D_AMBER, background: `${D_AMBER}18`, border: `1px solid ${D_AMBER}35`,
              borderRadius: 5, padding: '2px 8px',
            }}>
              {t.dashboard.monthlyBadge}
            </span>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MU, fontFamily: INTER, marginBottom: 18 }}>
            {chartSubtitle}
          </div>
          <ResponsiveContainer width="100%" height={195}>
            <BarChart data={revenueData} barCategoryGap="35%" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={D_AMBER} stopOpacity={1} />
                  <stop offset="100%" stopColor={D_AMBER} stopOpacity={0.45} />
                </linearGradient>
                <linearGradient id="barGradPeak" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#E8A030" stopOpacity={1} />
                  <stop offset="100%" stopColor={D_AMBER}  stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month" axisLine={false} tickLine={false}
                tick={{ fill: TEXT_MU, fontSize: 11, fontFamily: INTER }}
              />
              <YAxis
                axisLine={false} tickLine={false}
                tick={{ fill: TEXT_MU, fontSize: 10, fontFamily: INTER }}
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                width={30}
              />
              <Tooltip
                cursor={{ fill: 'rgba(28,26,22,0.04)' }}
                contentStyle={{
                  background: SURF_ELV, border: `1px solid \$\{BORDER\}`,
                  borderRadius: 8, fontSize: 11, fontFamily: INTER, color: TEXT_PR,
                }}
                labelStyle={{ color: TEXT_SEC }}
                formatter={(v) => [
                  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v) + ' kr',
                  t.dashboard.revenueLabel,
                ]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {revenueData.map((entry, idx) => {
                  const max = Math.max(...revenueData.map((d) => d.value));
                  return (
                    <Cell
                      key={idx}
                      fill={entry.value === max && max > 0 ? 'url(#barGradPeak)' : 'url(#barGrad)'}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Live events feed */}
        <div style={{ background: SURF, border: `1px solid \$\{BORDER\}`, borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PR, fontFamily: INTER }}>
              {t.dashboard.recentActivity}
            </span>
            <span style={{ fontSize: 10, color: TEXT_MU, fontFamily: INTER, letterSpacing: '0.06em' }}>
              {t.dashboard.totalCount(quotes.length)}
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {activity.length === 0 ? (
              <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, fontStyle: 'italic' }}>
                {t.dashboard.noJobsYet}
              </div>
            ) : activity.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: item.dot, marginTop: 5,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: TEXT_PR, fontFamily: INTER }}>{item.text}</div>
                  <div style={{ fontSize: 11, color: TEXT_MU, fontFamily: INTER, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sub}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: TEXT_MU, fontFamily: INTER, flexShrink: 0 }}>{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Quotes table ──────────────────────────────────────────────── */}
      <div style={{ background: SURF, border: `1px solid \$\{BORDER\}`, borderRadius: 12, padding: '18px 22px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PR, fontFamily: INTER, marginBottom: 16 }}>
          {t.dashboard.recentQuotes}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[t.dashboard.tableHeaders.no, t.dashboard.tableHeaders.date, t.dashboard.tableHeaders.cargo, t.dashboard.tableHeaders.amount, t.dashboard.tableHeaders.status].map((col) => (
                <th key={col} style={{
                  textAlign: 'left', fontSize: 10,
                  color: TEXT_MU, fontFamily: INTER, fontWeight: 600,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  padding: '0 16px 10px 0',
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
                  <div style={{ padding: '32px 8px', textAlign: 'center', fontFamily: INTER, fontSize: 12, color: TEXT_MU, fontStyle: 'italic' }}>
                    {t.dashboard.noJobsYet}
                  </div>
                </td>
              </tr>
            ) : displayQ.map((q) => {
              const isOk   = q.status === 'PAID' || q.status === 'BETALD';
              const isDecl = q.status === 'DECLINED' || q.status === 'AVBÖJD';
              const dotC   = isOk ? D_GREEN : isDecl ? D_RED : D_AMBER;
              const badge  = getStatusBadge(q.status, t);
              return (
                <tr key={q.id}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(28,26,22,0.035)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ fontSize: 12, fontFamily: MONO, color: D_AMBER, fontWeight: 600, padding: '11px 16px 11px 0', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>{q.id}</td>
                  <td style={{ fontSize: 12, fontFamily: MONO, color: TEXT_SEC, padding: '11px 16px 11px 0', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle', fontFeatureSettings: '"tnum"' }}>{fmtDate(q.created_at)}</td>
                  <td style={{ fontSize: 12, fontFamily: INTER, color: TEXT_SEC, padding: '11px 16px 11px 0', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.lasttyp || '—'}</td>
                  <td style={{ fontSize: 12, fontFamily: MONO, color: TEXT_PR, fontWeight: 500, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', padding: '11px 16px 11px 0', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{fmtSEK(q.totalpris_sek)}</td>
                  <td style={{ padding: '11px 0', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotC, flexShrink: 0 }} />
                      <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC }}>{badge.label}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Road Alerts ──────────────────────────────────────────────────────── */}
      {roadAlerts !== undefined && (
        <div style={{
          background: SURF,
          border: `1px solid ${roadAlerts.length > 0 ? 'rgba(184,60,60,0.30)' : BORDER}`,
          borderRadius: 12, padding: '18px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={14} color={roadAlerts.length > 0 ? D_RED : D_GREEN} />
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PR, fontFamily: INTER }}>
              {t.roadAlerts.sweden}
            </span>
            {roadAlerts.length === 0 && (
              <span style={{ fontSize: 10, fontFamily: INTER, color: D_GREEN, background: 'rgba(58,148,104,0.12)', border: '1px solid rgba(58,148,104,0.25)', borderRadius: 5, padding: '2px 8px' }}>
                {t.roadAlerts.normal}
              </span>
            )}
            {roadAlerts.length > 0 && (
              <span style={{ fontSize: 10, fontFamily: INTER, color: D_RED, background: 'rgba(184,60,60,0.12)', border: '1px solid rgba(184,60,60,0.25)', borderRadius: 5, padding: '2px 8px' }}>
                {t.roadAlerts.label(roadAlerts.length)}
              </span>
            )}
          </div>
          {roadAlerts.length === 0 ? (
            <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, fontStyle: 'italic' }}>
              {t.roadAlerts.none}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {roadAlerts.map((a) => (
                <div key={a.id} style={{
                  border: '1px solid rgba(184,60,60,0.22)', borderRadius: 8, padding: '10px 14px',
                  background: 'rgba(184,60,60,0.05)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, color: D_RED, flexShrink: 0 }}>{a.road}</span>
                    <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.location}</span>
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 11, color: D_AMBER, fontWeight: 500 }}>{a.condition}</div>
                  {a.warnings?.length > 0 && (
                    <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, marginTop: 2 }}>
                      {a.warnings.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Compliance + Market Intelligence ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Compliance Checklist */}
        <div style={{ background: SURF, border: `1px solid \$\{BORDER\}`, borderRadius: 12, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Shield size={13} color={D_BLUE} strokeWidth={1.5} />
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PR, fontFamily: INTER }}>
              {t.dashboard.compliance.heading}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: D_BLUE, background: `${D_BLUE}18`, border: `1px solid ${D_BLUE}35`, borderRadius: 4, padding: '1px 6px', marginLeft: 'auto' }}>
              {t.dashboard.compliance.badge}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                ok: lezPct >= 90,
                label: t.dashboard.compliance.lezLabel,
                detail: lezPct >= 90
                  ? t.dashboard.compliance.lezOkDetail(lezPct)
                  : t.dashboard.compliance.lezFailDetail(lezCount),
                icon: Leaf,
              },
              { ok: true, label: t.dashboard.compliance.drivingLabel,     detail: t.dashboard.compliance.drivingDetail,     icon: CalendarDays },
              { ok: true, label: t.dashboard.compliance.congestionLabel,   detail: t.dashboard.compliance.congestionDetail,  icon: AlertTriangle },
              { ok: true, label: t.dashboard.compliance.etsLabel,          detail: t.dashboard.compliance.etsDetail,         icon: Leaf },
            ].map(({ ok, label, detail, icon: CheckIcon }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  background: ok ? 'rgba(58,148,104,0.14)' : 'rgba(184,60,60,0.14)',
                  border: `1px solid ${ok ? 'rgba(58,148,104,0.28)' : 'rgba(184,60,60,0.28)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckIcon size={10} color={ok ? D_GREEN : D_RED} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_PR, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MU, marginTop: 1 }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Intelligence */}
        <div style={{ background: SURF, border: `1px solid \$\{BORDER\}`, borderRadius: 12, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={13} color="#7050B0" strokeWidth={1.5} />
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PR, fontFamily: INTER }}>
              {t.dashboard.marketIntel.heading}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 9, letterSpacing: '0.07em', color: TEXT_MU, marginLeft: 'auto' }}>{t.dashboard.marketIntel.badge}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { ...t.dashboard.marketIntel.stats[0], color: D_AMBER   },
              { ...t.dashboard.marketIntel.stats[1], color: '#7050B0' },
              { ...t.dashboard.marketIntel.stats[2], color: D_GREEN   },
            ].map(({ pct, label, color, insight }) => (
              <div key={pct} style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(28,26,22,0.04)', border: `1px solid ${BORDER}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color, letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{pct}</span>
                  <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, flex: 1, lineHeight: 1.4 }}>{label}</span>
                </div>
                <div style={{ fontFamily: INTER, fontSize: 10, color, opacity: 0.78 }}>{insight}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
      background: 'transparent', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 13, color: TEXT_SEC, fontFamily: INTER }}>{label}</div>
      <div style={{ fontSize: 11, color: TEXT_MU, fontFamily: INTER }}>{t.placeholderPage.comingSoon}</div>
    </div>
  );
}

// ─── EU 561 Compliance Warning Modal ─────────────────────────────────────────
function ComplianceWarningModal({ details, overrideReason, onReasonChange, onCancel, onOverride, saving, t }) {
  const tw = t.complianceWarning;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '24px 28px',
        width: 440, maxWidth: '94vw',
        boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgba(231,76,60,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>⚠</span>
          <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: '#7f1d1d' }}>
            {tw.heading}
          </div>
        </div>

        {/* Violations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {details.violations?.map((v, i) => (
            <div key={i} style={{
              background: 'rgba(231,76,60,0.06)',
              border: '1px solid rgba(231,76,60,0.22)',
              borderRadius: 7, padding: '10px 12px',
              fontFamily: INTER, fontSize: 12, color: '#7f1d1d', lineHeight: 1.5,
            }}>
              {v.message}
            </div>
          ))}
        </div>

        {/* Fine risk note */}
        <div style={{ fontFamily: INTER, fontSize: 11, color: '#b45309', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '8px 12px' }}>
          {tw.fineRisk}
        </div>

        {/* Override reason */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: '#6b6359' }}>
            {tw.overrideLabel}
          </span>
          <textarea
            value={overrideReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={tw.overrideHint}
            rows={3}
            style={{
              fontFamily: INTER, fontSize: 12, color: '#1c1917',
              background: '#fafaf8', border: '1px solid #e6e2da',
              borderRadius: 7, padding: '8px 10px', resize: 'none',
              outline: 'none', lineHeight: 1.5,
              width: '100%', boxSizing: 'border-box',
            }}
          />
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onOverride}
            disabled={saving || !overrideReason.trim()}
            style={{
              flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 600,
              padding: '9px 0', borderRadius: 7, cursor: (saving || !overrideReason.trim()) ? 'not-allowed' : 'pointer',
              background: '#b91c1c', color: '#fff', border: 'none',
              opacity: (saving || !overrideReason.trim()) ? 0.55 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {saving ? tw.overriding : tw.override}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 500,
              padding: '9px 0', borderRadius: 7, cursor: 'pointer',
              background: 'transparent', color: '#6b6359',
              border: '1px solid #e6e2da',
            }}
          >
            {tw.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App (inner — only rendered when authenticated) ──────────────────────────
function AppInner() {
  const { t, lang, setLang } = useLanguage();
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
  const [showNewQuote,    setShowNewQuote]     = useState(false); // kept for SubscriptionGate compat
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
  const [mallModal,          setMallModal]          = useState(null);
  const [showMallManager,    setShowMallManager]    = useState(false);
  const [showEmailQuoteModal, setShowEmailQuoteModal] = useState(false);
  const [emailQuoteInput,    setEmailQuoteInput]    = useState({ to: '', name: '', cc: true });
  const [msgQuote,         setMsgQuote]         = useState(null);  // { rawId, id, lasttyp }
  const [fortnoxResult,    setFortnoxResult]    = useState(null);  // toast from OAuth redirect
  const [dpaAccepted,      setDpaAccepted]      = useState(() => Boolean(company?.dpa_accepted_at));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [complianceWarn,   setComplianceWarn]   = useState(null); // { details, pendingQuoteId }
  const [overrideReason,   setOverrideReason]   = useState('');

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

  // Detect Stripe redirect-back (?stripe=success or ?stripe=cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get('stripe');
    if (!stripe) return;
    const clean = window.location.pathname + window.location.hash.replace(/\?.*/, '');
    window.history.replaceState({}, '', clean);
    setActivePage('settings');
    if (stripe === 'success') {
      setFortnoxResult({ message: t.subscriptionGate.stripeSuccess, variant: 'success' });
    } else if (stripe === 'cancel') {
      setFortnoxResult({ message: t.subscriptionGate.stripeCancel, variant: 'error' });
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

    // Primary: /api/route — ORS HGV routing + LEZ avoidance + multi-vehicle cost comparison
    const vehicle_id     = parsed?.fordon_rekommenderat ?? parsed?.fordon_id ?? null;
    const departure_time = parsed?.datum ?? null;
    const weight_kg      = weight_ton != null ? Math.round(weight_ton * 1000) : null;
    const routeCall = apiFetch('/api/route', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pickup, delivery, vehicle_id, departure_time, weight_kg, lasttyp: parsed?.lasttyp }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setRouteData(d);
        if (d.distance_km != null) applyRoute(d.distance_km);
        // Auto-apply cost-optimal vehicle if it differs from the calculated recommendation
        if (d.optimal_vehicle?.ext_id && d.optimal_vehicle.ext_id !== vehicle_id) {
          setField('fordon_rekommenderat', d.optimal_vehicle.ext_id);
        }
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
    setActivePage(id);
  }

  function handleLoadTemplate(tpl) {
    loadTemplate(tpl);
    setQuoteNumber(null);
    setShareToken(null);
    setSmsResult(null);
    setActivePage('new-quote');
  }

  function openMallModal() {
    if (!parsed) return;
    const parts = [
      parsed.lasttyp,
      [parsed.upphämtning, parsed.leverans].filter(Boolean).join(' – '),
    ].filter(Boolean);
    setMallModal({ name: parts.join(' · ') });
  }

  function openMallModalFromQuote(q) {
    const parts = [
      q.lasttyp,
      [q.upphämtning, q.leverans].filter(Boolean).join(' – '),
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
      // Compute human overrides: fields changed from original extracted output
      const humanOverrides = {};
      if (originalParsed) {
        for (const key of Object.keys(parsed)) {
          if (originalParsed[key] !== undefined &&
              String(parsed[key]) !== String(originalParsed[key])) {
            humanOverrides[key] = { from: originalParsed[key], to: parsed[key] };
          }
        }
      }

      setQuoteStatus(null);
      setSavedCustEmail(null);
      setSavedQuoteRawId(null);

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
      setSavedQuoteRawId(quote.rawId ?? parseInt(String(quote.id).split('-').pop(), 10));

      // Persist new quote to IndexedDB immediately
      await db.quotes.put(quote).catch(() => {});

      const rawId = parseInt(String(quote.id).split('-').pop(), 10);
      const jRes  = await apiFetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: rawId }),
      });
      if (jRes.status === 409) {
        const details = await jRes.json();
        if (details.compliance_error) {
          setComplianceWarn({ details, pendingQuoteId: rawId });
          setSaving(false);
          return;
        }
      }
      if (!jRes.ok) throw new Error(`HTTP ${jRes.status}`);
      const job = await jRes.json();
      // Persist new job to IndexedDB
      await db.jobs.put({ id: job.id, quote_id: rawId, status: 'planerad', created_at: new Date().toISOString() }).catch(() => {});
      setSmsResult({ status: job.sms_status, driverName: job.sms_driver_name, error: job.sms_error });

      if (job.sms_status === 'sent') {
        const who = job.sms_driver_name ?? t.settings.drivers.name;
        setToast({ message: `${t.jobs.heading} — SMS – ${who}`, variant: 'success' });
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
      modelUsed:   extractionModel ?? 'tms',
      generatedAt: new Date().toISOString().slice(0, 10),
      company:     company,
    });
  }

  // ── Quote email + status actions ──────────────────────────────────────────
  const [savedQuoteRawId,  setSavedQuoteRawId]  = useState(null);
  const [quoteStatus,      setQuoteStatus]      = useState(null);
  const [savedCustEmail,   setSavedCustEmail]   = useState(null);

  async function handleEmailQuote({ to, customerName, ccOwner, statusOnly }) {
    if (!savedQuoteRawId) return;
    // Status-only update (godkänd / avböjd)
    if (statusOnly) {
      try {
        const r = await apiFetch(`/api/quotes/${savedQuoteRawId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: statusOnly }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setQuoteStatus(statusOnly);
        setToast({ message: t.newQuote.statusUpdated(statusOnly), variant: 'success' });
        // Re-sync pricing insights so win-rate panel reflects the new outcome
        syncPricingInsights(localStorage.getItem('auth_token')).catch(() => {});
      } catch (e) {
        setToast({ message: e.message, variant: 'error' });
      }
      return;
    }

    // Full email send
    const { quotePdfBase64 } = await import('./utils/generatePdf.js');
    const { base64, filename } = quotePdfBase64(parsed, quoteNumber, fleet, {
      userName:    user?.name ?? user?.email ?? 'Okänd',
      modelUsed:   extractionModel ?? 'tms',
      generatedAt: new Date().toISOString().slice(0, 10),
      company,
    });

    const r = await apiFetch(`/api/quotes/${savedQuoteRawId}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, customer_name: customerName, cc_owner: ccOwner, pdf_base64: base64, filename }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    const result = await r.json();
    setQuoteStatus('skickad');
    setSavedCustEmail(to);
    const msg = result.simulated ? t.newQuote.emailSimulated : t.newQuote.emailSentTo(to);
    setToast({ message: msg, variant: result.simulated ? 'warning' : 'success' });
  }

  const lezVarning     = parsed?.lez_varning ?? false;
  const tillstandKravs = parsed?.['tillstånd_krävs'] ?? parsed?.tillstand_kravs ?? false;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: BG_BASE }}>

      <Sidebar
        activePage={activePage}
        onNavigate={(page) => { handleNavigate(page); setMobileSidebarOpen(false); }}
        company={company}
        onLogout={logout}
        userRole={user?.role}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* ── Right side ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* ── Minimal header: search + language toggle ──────────── */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', gap: 12,
        }}>
          {/* Hamburger — only shown on mobile via CSS */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileSidebarOpen(true)}
            style={{
              display: 'none', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, background: 'none', border: 'none',
              cursor: 'pointer', flexShrink: 0, padding: 0,
              color: TEXT_MU,
            }}
            aria-label="Open navigation"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <rect y="0"  width="18" height="2" rx="1" fill="currentColor"/>
              <rect y="6"  width="18" height="2" rx="1" fill="currentColor"/>
              <rect y="12" width="18" height="2" rx="1" fill="currentColor"/>
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <Search
              size={13} color={TEXT_MU}
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <input
              placeholder={t.topbar.searchPlaceholder}
              style={{
                width: 200, height: 30,
                background: SURF_ELV, border: `1px solid ${BORDER}`,
                borderRadius: 7, color: TEXT_PR,
                fontFamily: INTER, fontSize: 12,
                paddingLeft: 28, paddingRight: 10,
                outline: 'none', transition: 'border-color 150ms',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
            />
          </div>
          <div style={{ display: 'flex', gap: 2, background: SURF_ELV, borderRadius: 7, padding: 3, border: `1px solid ${BORDER}` }}>
            {['en', 'sv'].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  fontFamily: INTER, fontSize: 10, fontWeight: 600,
                  background: lang === l ? SURF : 'transparent',
                  color: lang === l ? TEXT_PR : TEXT_MU,
                  border: 'none', borderRadius: 5, padding: '3px 9px',
                  cursor: 'pointer', transition: 'background 150ms, color 150ms',
                  letterSpacing: '0.05em',
                  boxShadow: lang === l ? '0 1px 2px rgba(28,25,23,0.08)' : 'none',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activePage === 'dashboard' && (
            <Dashboard
              quotes={quotes}
              fuelPrice={fuelPrice}
              roadAlerts={roadAlerts}
              onNewQuote={() => setActivePage('new-quote')}
              fleet={fleet}
            />
          )}
          {activePage === 'settings' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Settings onFortnoxResult={fortnoxResult} />
            </div>
          )}
          {activePage === 'operations' && <OperationsPage />}
          {activePage === 'fleet' && <FleetEnvPage />}
          {activePage === 'kortider' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Kortider />
            </div>
          )}
          {activePage === 'upphandlingar' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Upphandlingar />
            </div>
          )}
          {activePage === 'natverk' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Natverk />
            </div>
          )}
          {activePage === 'drivmedel' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Drivmedel />
            </div>
          )}
          {activePage === 'underhall' && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Underhall />
            </div>
          )}
          {/* ── New Quote tab ──────────────────────────────────────────── */}
          {activePage === 'new-quote' && (
          <div className="new-quote-grid" style={{
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
                        [tpl.upphämtning, tpl.leverans].filter(Boolean).join(' – '),
                      ].filter(Boolean).join(' · ') || tpl.name;
                      return (
                        <button
                          key={tpl.id}
                          onClick={() => handleLoadTemplate(tpl)}
                          title={tpl.name}
                          style={{
                            fontFamily: INTER, fontSize: '0.6875rem',
                            color: CYAN, background: 'rgba(94,234,212,0.08)',
                            border: '1px solid rgba(94,234,212,0.2)', borderRadius: 100,
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
                      color: TEXT_MU, cursor: 'pointer', textAlign: 'left',
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
                    color: TEXT_MU, cursor: 'pointer', textAlign: 'left',
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

              {/* Subscription gate — shown when analysis returns 402 */}
              {status === 'error' && error === 'subscription_required' && (
                <SubscriptionGate onClose={() => setActivePage('dashboard')} />
              )}

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
                            {rec}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Route map — ORS HGV routing + LEZ avoidance + cost breakdown */}
                  {(routeData || routeLoading) && (
                    <RouteMap routeData={routeData} loading={routeLoading} />
                  )}

                  {/* Vehicle cost comparison — cost-optimal vehicle selection */}
                  {routeData?.vehicle_comparison?.length > 0 && (
                    <VehicleComparisonPanel
                      routeData={routeData}
                      onOverride={(vehicleId) => setField('fordon_rekommenderat', vehicleId)}
                    />
                  )}

                  {lezVarning && (
                    <div style={{
                      flexShrink: 0,
                      background: 'var(--lez-bg)', border: '1px solid rgba(231,76,60,0.2)',
                      borderRadius: 8, padding: '8px 12px',
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                    }}>
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
                          ? 'linear-gradient(135deg, #2dd4bf, #5eead4)'
                          : 'rgba(255,255,255,0.06)',
                        color: canSave ? '#080b14' : TEXT_MU,
                        border: 'none',
                        borderRadius: 10, padding: '11px 14px',
                        cursor: (saving || !canSave) ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.55 : 1,
                        transition: 'opacity 0.15s, box-shadow 0.15s',
                        boxShadow: canSave ? '0 0 20px rgba(94,234,212,0.3)' : 'none',
                      }}
                      onMouseEnter={(e) => { if (canSave && !saving) e.currentTarget.style.boxShadow = '0 0 30px rgba(94,234,212,0.5)'; }}
                      onMouseLeave={(e) => { if (canSave && !saving) e.currentTarget.style.boxShadow = '0 0 20px rgba(94,234,212,0.3)'; }}
                    >
                      {saving ? t.newQuote.saving : t.newQuote.confirmQuote}
                    </button>
                    <button
                      onClick={handleExport}
                      style={{
                        flexShrink: 0, fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: 'transparent', color: TEXT_SEC,
                        border: '1px solid rgba(94,234,212,0.3)', borderRadius: 10,
                        padding: '11px 14px', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = CYAN; e.currentTarget.style.color = CYAN; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(94,234,212,0.3)'; e.currentTarget.style.color = TEXT_SEC; }}
                    >
                      {t.newQuote.exportPdf}
                    </button>

                    {/* Email to customer — agare + trafikledare only */}
                    {['agare', 'trafikledare'].includes(user?.role) && <button
                      onClick={() => setShowEmailQuoteModal(true)}
                      disabled={!savedQuoteRawId}
                      title={!savedQuoteRawId ? 'Spara offerten först' : 'Skicka offert per e-post'}
                      style={{
                        flexShrink: 0, fontFamily: INTER, fontSize: '0.6875rem', fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: quoteStatus === 'skickad' ? 'rgba(29,107,69,0.15)' : 'transparent',
                        color: quoteStatus === 'skickad' ? '#2ecc71' : savedQuoteRawId ? TEXT_SEC : TEXT_MU,
                        border: `1px solid ${quoteStatus === 'skickad' ? 'rgba(46,204,113,0.3)' : 'rgba(94,234,212,0.3)'}`,
                        borderRadius: 10, padding: '11px 14px',
                        cursor: savedQuoteRawId ? 'pointer' : 'not-allowed',
                        transition: 'all 0.15s',
                        opacity: savedQuoteRawId ? 1 : 0.45,
                      }}
                      onMouseEnter={(e) => { if (savedQuoteRawId && quoteStatus !== 'skickad') { e.currentTarget.style.borderColor = CYAN; e.currentTarget.style.color = CYAN; } }}
                      onMouseLeave={(e) => { if (savedQuoteRawId && quoteStatus !== 'skickad') { e.currentTarget.style.borderColor = 'rgba(94,234,212,0.3)'; e.currentTarget.style.color = TEXT_SEC; } }}
                    >
                      {quoteStatus === 'skickad' ? '✓ Skickad' : '✉ Skicka till kund'}
                    </button>}
                  </div>

                  {/* Status update row — visible after save */}
                  {savedQuoteRawId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: INTER, fontSize: '0.625rem', color: TEXT_MU }}>Status:</span>
                      {[
                        { s: 'godkänd', label: 'Godkänd', ok: true },
                        { s: 'avböjd',  label: 'Avböjd',  ok: false },
                      ].map(({ s, label, ok }) => (
                        <button
                          key={s}
                          onClick={() => handleEmailQuote({ statusOnly: s })}
                          style={{
                            fontFamily: INTER, fontSize: '0.5625rem', fontWeight: 700,
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                            padding: '3px 10px', borderRadius: 20,
                            color: quoteStatus === s ? (ok ? '#2ecc71' : '#f43f5e') : TEXT_MU,
                            background: quoteStatus === s
                              ? (ok ? 'rgba(46,204,113,0.1)' : 'rgba(244,63,94,0.08)')
                              : 'transparent',
                            border: `1px solid ${quoteStatus === s
                              ? (ok ? 'rgba(46,204,113,0.3)' : 'rgba(244,63,94,0.3)')
                              : BORDER}`,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

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
                      padding: '9px 0', borderBottom: `1px solid ${BORDER}`,
                      cursor: 'default',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(28,26,22,0.02)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontFamily: INTER, fontSize: '0.8125rem', color: TEXT_PR, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {q.lasttyp ?? '—'}
                        </span>
                        <span style={{ fontFamily: INTER, fontSize: '0.8125rem', fontWeight: 600, color: AMBER, flexShrink: 0 }}>
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
          )}
        </div>
      </div>

      {/* ── Spara som mall modal ─────────────────────────────────────────── */}
      {mallModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(14,20,36,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: 28, width: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: TEXT_MU, marginBottom: 16 }}>
              {t.newQuote.templateModal.heading}
            </div>
            <label style={{ display: 'block', marginBottom: 22 }}>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: TEXT_MU, marginBottom: 5 }}>
                {t.newQuote.templateModal.nameLabel}
              </div>
              <input
                autoFocus
                value={mallModal.name}
                onChange={(e) => setMallModal((prev) => ({ ...prev, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveMall(); if (e.key === 'Escape') setMallModal(null); }}
                style={{
                  width: '100%', fontFamily: INTER, fontSize: '0.875rem', color: TEXT_PR,
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px',
                  outline: 'none', boxSizing: 'border-box', background: 'rgba(20,27,45,0.8)',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMallModal(null)}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', padding: '9px 18px',
                  border: '1px solid rgba(94,234,212,0.2)', borderRadius: 10,
                  background: 'transparent', color: CYAN, cursor: 'pointer',
                }}
              >
                {t.newQuote.templateModal.cancel}
              </button>
              <button
                onClick={handleSaveMall}
                disabled={!mallModal.name.trim()}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', fontWeight: 600, padding: '9px 18px',
                  border: 'none', borderRadius: 10,
                  background: mallModal.name.trim() ? 'linear-gradient(135deg, #2dd4bf, #5eead4)' : 'rgba(255,255,255,0.06)',
                  color: mallModal.name.trim() ? '#080b14' : TEXT_MU,
                  cursor: mallModal.name.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: mallModal.name.trim() ? '0 0 15px rgba(94,234,212,0.3)' : 'none',
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
            background: 'rgba(14,20,36,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, width: 460, maxHeight: '78vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: TEXT_MU }}>
                {t.newQuote.templateManager.heading}{templates.length > 0 ? ` (${templates.length})` : ''}
              </span>
              <button
                onClick={() => setShowMallManager(false)}
                style={{ fontFamily: INTER, fontSize: '0.875rem', background: 'none', border: 'none', color: TEXT_SEC, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {templates.length === 0 ? (
                <div style={{ fontFamily: INTER, fontSize: '0.8125rem', color: TEXT_MU, textAlign: 'center', padding: '36px 24px', fontStyle: 'italic' }}>
                  {t.newQuote.templateManager.empty}
                </div>
              ) : (
                templates.map((tpl, i) => (
                  <div key={tpl.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 24px',
                    borderBottom: i < templates.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: INTER, fontSize: '0.8125rem', color: TEXT_PR, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tpl.name}
                      </div>
                      <div style={{ fontFamily: INTER, fontSize: '0.5625rem', color: TEXT_MU, marginTop: 2 }}>
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
                        background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6,
                        color: DANGER, cursor: 'pointer', padding: '4px 9px', flexShrink: 0,
                      }}
                    >
                      {t.newQuote.templateManager.delete}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowMallManager(false)}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', padding: '8px 20px',
                  border: '1px solid rgba(94,234,212,0.2)', borderRadius: 10,
                  background: 'transparent', color: CYAN, cursor: 'pointer',
                }}
              >
                {t.newQuote.templateManager.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email offert modal ──────────────────────────────────────────── */}
      {showEmailQuoteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(14,20,36,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: 28, width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: TEXT_MU, marginBottom: 20 }}>
              {t.quoteCard.sendByEmail}
            </div>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: TEXT_MU, marginBottom: 5 }}>
                {t.quoteCard.emailModal.emailLabel}
              </div>
              <input
                autoFocus
                type="email"
                value={emailQuoteInput.to}
                onChange={(e) => setEmailQuoteInput((prev) => ({ ...prev, to: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowEmailQuoteModal(false); }}
                placeholder="kund@foretag.se"
                style={{
                  width: '100%', fontFamily: INTER, fontSize: '0.875rem', color: TEXT_PR,
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px',
                  outline: 'none', boxSizing: 'border-box', background: 'rgba(20,27,45,0.8)',
                }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: TEXT_MU, marginBottom: 5 }}>
                {t.quoteCard.emailModal.nameLabel}
              </div>
              <input
                type="text"
                value={emailQuoteInput.name}
                onChange={(e) => setEmailQuoteInput((prev) => ({ ...prev, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowEmailQuoteModal(false); }}
                placeholder="Johan Svensson"
                style={{
                  width: '100%', fontFamily: INTER, fontSize: '0.875rem', color: TEXT_PR,
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px',
                  outline: 'none', boxSizing: 'border-box', background: 'rgba(20,27,45,0.8)',
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={emailQuoteInput.cc}
                onChange={(e) => setEmailQuoteInput((prev) => ({ ...prev, cc: e.target.checked }))}
                style={{ accentColor: CYAN, width: 14, height: 14 }}
              />
              <span style={{ fontFamily: INTER, fontSize: '0.75rem', color: TEXT_SEC }}>
                Skicka kopia till ägaren (CC)
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowEmailQuoteModal(false); setEmailQuoteInput({ to: '', name: '', cc: true }); }}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', padding: '9px 18px',
                  border: '1px solid rgba(94,234,212,0.2)', borderRadius: 10,
                  background: 'transparent', color: CYAN, cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                onClick={async () => {
                  const { to, name, cc } = emailQuoteInput;
                  if (!to.trim()) return;
                  try {
                    await handleEmailQuote({ to: to.trim(), customerName: name.trim() || undefined, ccOwner: cc });
                    setShowEmailQuoteModal(false);
                    setEmailQuoteInput({ to: '', name: '', cc: true });
                  } catch (e) {
                    setToast({ message: e.message, variant: 'error' });
                  }
                }}
                disabled={!emailQuoteInput.to.trim()}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', fontWeight: 600, padding: '9px 18px',
                  border: 'none', borderRadius: 10,
                  background: emailQuoteInput.to.trim() ? 'linear-gradient(135deg, #2dd4bf, #5eead4)' : 'rgba(255,255,255,0.06)',
                  color: emailQuoteInput.to.trim() ? '#080b14' : TEXT_MU,
                  cursor: emailQuoteInput.to.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: emailQuoteInput.to.trim() ? '0 0 15px rgba(94,234,212,0.3)' : 'none',
                }}
              >
                Skicka offert
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

      {/* EU 561 compliance warning modal */}
      {complianceWarn && (
        <ComplianceWarningModal
          details={complianceWarn.details}
          pendingQuoteId={complianceWarn.pendingQuoteId}
          overrideReason={overrideReason}
          onReasonChange={setOverrideReason}
          onCancel={() => { setComplianceWarn(null); setOverrideReason(''); }}
          onOverride={async () => {
            if (!overrideReason.trim()) return;
            setSaving(true);
            try {
              const jRes = await apiFetch('/api/jobs', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  quote_id:        complianceWarn.pendingQuoteId,
                  override:        true,
                  override_reason: overrideReason.trim(),
                }),
              });
              if (!jRes.ok) throw new Error(`HTTP ${jRes.status}`);
              const job = await jRes.json();
              await db.jobs.put({ id: job.id, quote_id: complianceWarn.pendingQuoteId, status: 'planerad', created_at: new Date().toISOString() }).catch(() => {});
              setSmsResult({ status: job.sms_status, driverName: job.sms_driver_name, error: job.sms_error });
              setToast({ message: `${t.jobs.heading} — ${t.complianceWarning.override}`, variant: 'warning' });
              setComplianceWarn(null);
              setOverrideReason('');
            } catch (e) {
              setToast({ message: e.message, variant: 'error' });
            } finally { setSaving(false); }
          }}
          saving={saving}
          t={t}
        />
      )}

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
      minHeight: '100vh', background: 'radial-gradient(circle at 50% 0%, #0d1424 0%, #080b14 60%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: INTER, padding: 24,
    }}>
      <div style={{
        background: 'rgba(20,27,45,0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
        padding: '48px 40px', maxWidth: 440, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <span style={{ fontSize: 22 }}>⏸</span>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT_PR, margin: '0 0 10px' }}>
          {t.subscriptionPaused.heading}
        </h1>
        <p style={{ fontSize: 13, color: TEXT_SEC, margin: '0 0 28px', lineHeight: 1.7 }}>
          {t.subscriptionPaused.desc}
        </p>
        <a
          href={`mailto:admin@akaren.se?subject=${encodeURIComponent(t.subscriptionPaused.heading + ' — ' + (company?.name ?? ''))}`}
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #2dd4bf, #5eead4)',
            color: '#080b14',
            fontFamily: INTER, fontSize: 13, fontWeight: 600,
            padding: '10px 24px', borderRadius: 10, textDecoration: 'none',
            marginBottom: 16,
            boxShadow: '0 0 20px rgba(94,234,212,0.3)',
          }}
        >
          {t.subscriptionPaused.contact}
        </a>
        <div>
          <button
            onClick={onLogout}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: INTER, fontSize: 12, color: TEXT_MU,
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
          color: '#e74c3c', padding: 32, fontFamily: "'Geist', system-ui, sans-serif",
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

// ─── Operations compound page (Jobs + Dispatch) ──────────────────────────────
function OperationsPage() {
  const [tab, setTab] = useState('jobs');
  const { t } = useLanguage();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 24px', borderBottom: `1px solid ${BORDER}`,
        background: SURF, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div className="sub-tabs">
          <button className={`sub-tab${tab === 'jobs' ? ' active' : ''}`} onClick={() => setTab('jobs')}>
            {t.nav.jobs}
          </button>
          <button className={`sub-tab${tab === 'dispatch' ? ' active' : ''}`} onClick={() => setTab('dispatch')}>
            {t.dispatch.planning}
          </button>
        </div>
      </div>
      {tab === 'jobs'
        ? <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}><Jobs /></div>
        : <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><Dispatch /></div>
      }
    </div>
  );
}

// ─── Fleet compound page (Fleet + CO₂) ───────────────────────────────────────
function FleetEnvPage() {
  const [tab, setTab] = useState('fleet');
  const { t } = useLanguage();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 24px', borderBottom: `1px solid ${BORDER}`,
        background: SURF, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div className="sub-tabs">
          <button className={`sub-tab${tab === 'fleet' ? ' active' : ''}`} onClick={() => setTab('fleet')}>
            {t.fleet.vehicleTab}
          </button>
          <button className={`sub-tab${tab === 'co2' ? ' active' : ''}`} onClick={() => setTab('co2')}>
            {t.co2.title}
          </button>
        </div>
      </div>
      {tab === 'fleet'
        ? <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}><Fleet /></div>
        : <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}><Co2 /></div>
      }
    </div>
  );
}

// ─── Auth gate — keeps hook count stable across auth transitions ─────────────
function AppShell() {
  const { isAuthenticated, user, company, login, logout, updateCompany } = useAuth();

  // Invite setup page — accessible without auth
  if (window.location.pathname === '/setup-account') {
    return (
      <SetupAccount
        onSetupComplete={(data) => {
          login(data);
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  if (!isAuthenticated) return <Login />;

  // Forare sees only their job view, no full dashboard
  if (user?.role === 'forare') {
    return <DriverView user={user} onLogout={logout} />;
  }

  if (company?.active === 0 || company?.active === false) {
    return <SubscriptionPaused company={company} onLogout={logout} />;
  }
  // Only show Onboarding when company is actually loaded but not completed —
  // not when company is null (still loading from server).
  if (company && !company.onboarding_completed_at) {
    return <Onboarding onComplete={updateCompany} />;
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
