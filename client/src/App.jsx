import { useState, useCallback, useEffect, useRef, useMemo, Component } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
import {
  Home,
  FilePlus, Briefcase, Truck,
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
import Underhall             from './pages/Underhall.jsx';
import { SetupAccount }   from './pages/SetupAccount.jsx';
import { TourOverlay }    from './components/TourOverlay.jsx';
import { SubscriptionGate } from './components/SubscriptionGate.jsx';
import { SplashScreen }  from './components/SplashScreen.jsx';
import { LogoCompact } from './assets/Logo.jsx';
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


// Roles that can access each nav item
const NAV_ROLES = {
  home:     ['agare', 'trafikledare', 'ekonomi', 'revisor'],
  quotes:   ['agare', 'trafikledare', 'ekonomi', 'revisor'],
  uppdrag:  ['agare', 'trafikledare', 'ekonomi', 'revisor'],
  fleet:    ['agare', 'trafikledare'],
  ekonomi:  ['agare', 'ekonomi', 'revisor'],
  settings: ['agare', 'trafikledare', 'ekonomi', 'revisor'],
};

function getNavItems(t, role) {
  const all = [
    { id: 'home',     label: t.nav.home,     Icon: Home,         group: 'main' },
    { id: 'quotes',   label: t.nav.quotes,   Icon: FilePlus,     group: 'main' },
    { id: 'uppdrag',  label: t.nav.uppdrag,  Icon: Briefcase,    group: 'main' },
    { id: 'fleet',    label: t.nav.fleet,    Icon: Truck,        group: 'main' },
    { id: 'ekonomi',  label: t.nav.ekonomi,  Icon: DollarSign,   group: 'main' },
    { id: 'settings', label: t.nav.settings, Icon: SettingsIcon, group: 'main' },
  ];
  return all.filter((n) => !role || (NAV_ROLES[n.id] ?? []).includes(role));
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ id, label, Icon, isActive, onClick }) {
  return (
    <motion.button
      data-nav-id={id}
      onClick={onClick}
      whileHover={{ x: isActive ? 0 : 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: isActive ? ACCENT_SF : 'transparent',
        border: 'none',
        borderRadius: 10,
        color: isActive ? ACCENT : TEXT_SEC,
        fontSize: 11, fontFamily: INTER, fontWeight: isActive ? 600 : 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer', textAlign: 'left',
        lineHeight: 1.3,
        marginBottom: 2,
        outline: 'none',
      }}
    >
      <Icon size={14} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </motion.button>
  );
}

const DOT_BG = { background: 'transparent' };

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, company, onLogout, userRole, mobileOpen, onMobileClose }) {
  const { t } = useLanguage();
  const navItems = getNavItems(t, userRole);
  return (
    <>
      {mobileOpen && (
        <div className="mobile-backdrop" onClick={onMobileClose} aria-hidden />
      )}
      <aside className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`} style={{
        width: 220, flexShrink: 0,
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
          <div style={{ padding: '0 4px', marginBottom: 32, flexShrink: 0 }}>
            <LogoCompact markSize={28} color={TEXT_PR} />
          </div>

          {/* Nav — 5 items only */}
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map(({ id, label, Icon }) => (
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



// ─── AnimatedNumber — spring count-up from 0 to target ───────────────────────
function AnimatedNumber({ target, format }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 180, damping: 24 });
  const display = useTransform(spring, format);
  useEffect(() => { mv.set(target); }, [target, mv]);
  return <motion.span>{display}</motion.span>;
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, rawValue, formatFn, change, changeUp, accentColor, Icon: IconProp }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 4px 24px rgba(0,0,0,0.09)' }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      style={{
        background: SURF,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: '18px 20px 20px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(28,25,23,0.04), 0 4px 16px rgba(28,25,23,0.04)',
      }}
    >
      {/* Left accent rule */}
      <div style={{
        position: 'absolute', left: 0, top: 16, bottom: 16, width: 3,
        borderRadius: '0 2px 2px 0', background: accentColor,
        opacity: 0.7,
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        {IconProp && (
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `${accentColor}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <IconProp size={14} color={accentColor} strokeWidth={1.5} />
          </div>
        )}
        {change && (
          <span style={{
            fontFamily: INTER, fontSize: 10, fontWeight: 600,
            color: changeUp ? D_GREEN : D_RED,
            background: changeUp ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
            border: `1px solid ${changeUp ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'}`,
            padding: '2px 7px', borderRadius: 100, whiteSpace: 'nowrap', marginLeft: 'auto',
          }}>
            {changeUp ? '+' : ''}{change}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: TEXT_MU, marginBottom: 5,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 24, fontWeight: 700,
        color: TEXT_PR, letterSpacing: '-0.03em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {rawValue != null && formatFn
          ? <AnimatedNumber target={rawValue} format={formatFn} />
          : value}
      </div>
    </motion.div>
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
  const [activePage,      setActivePage]      = useState('home');
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
    setActivePage('quotes');
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

        <AnimatePresence mode="wait">
        <motion.div
          key={activePage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {/* ── Core pages ────────────────────────────────────────────────── */}
          {activePage === 'home'     && <HomePage onNavigate={setActivePage} />}
          {activePage === 'settings' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Settings onFortnoxResult={fortnoxResult} />
            </div>
          )}
          {activePage === 'uppdrag' && <UppdragPage />}
          {activePage === 'fleet' && <FordonPage />}
          {activePage === 'ekonomi' && <EkonomiPage />}


          {/* ── Offert / New Quote ────────────────────────────────────── */}
          {activePage === 'quotes' && (
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
                <SubscriptionGate onClose={() => setActivePage('uppdrag')} />
              )}

              {status === 'done' && parsed && (
                <>
                  {/* Pricing Analysis — only when we have cargo type + a real price */}
                  {parsed.lasttyp && Number(parsed.totalpris_sek) > 0 && (
                    <PricingIntelligencePanel
                      lasttyp={String(parsed.lasttyp)}
                      currentPrice={Number(parsed.totalpris_sek)}
                      parsed={parsed}
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
                              {t.newQuote.routeAdvisory.moreAlerts(routeAdvisory.route_alerts.length - 3)}
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
                      {quoteStatus === 'skickad' ? t.quoteCard.sentBtn : t.quoteCard.sendBtn}
                    </button>}
                  </div>

                  {/* Status update row — visible after save */}
                  {savedQuoteRawId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: INTER, fontSize: '0.625rem', color: TEXT_MU }}>Status:</span>
                      {[
                        { s: 'godkänd', label: t.quoteCard.accepted, ok: true },
                        { s: 'avböjd',  label: t.quoteCard.declined, ok: false },
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
                            title={`${t.newQuote.msgTooltip(q.msg_count)}${q.co_pending > 0 ? ` · ${t.newQuote.coPendingHint}` : ''}`}
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
        </motion.div>
        </AnimatePresence>
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

      <AnimatePresence>
        {toast && <Toast key="toast" message={toast.message ?? toast} variant={toast.variant ?? 'success'} onDismiss={dismissToast} />}
      </AnimatePresence>

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
        <h1 style={{ fontSize: 24, fontWeight: 700, color: TEXT_PR, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
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
          background: BG_BASE, minHeight: '100vh', whiteSpace: 'pre-wrap',
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

// ─── Uppdrag page (Jobs + Dispatch calendar) ─────────────────────────────────
function UppdragPage() {
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

// ─── Fordon page (Fleet + Maintenance tabs) ───────────────────────────────────
function FordonPage() {
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
          <button className={`sub-tab${tab === 'underhall' ? ' active' : ''}`} onClick={() => setTab('underhall')}>
            {t.nav.underhall}
          </button>
        </div>
      </div>
      {tab === 'fleet'
        ? <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}><Fleet /></div>
        : <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}><Underhall /></div>
      }
    </div>
  );
}

// ─── Ekonomi page (Invoices + Profitability tabs) ─────────────────────────────
function EkonomiPage() {
  const [tab, setTab] = useState('invoices');
  const { t } = useLanguage();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 24px', borderBottom: `1px solid ${BORDER}`,
        background: SURF, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div className="sub-tabs">
          <button className={`sub-tab${tab === 'invoices' ? ' active' : ''}`} onClick={() => setTab('invoices')}>
            {t.ekonomi.tabInvoices}
          </button>
          <button className={`sub-tab${tab === 'profitability' ? ' active' : ''}`} onClick={() => setTab('profitability')}>
            {t.ekonomi.tabProfit}
          </button>
        </div>
      </div>
      {tab === 'invoices'
        ? <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}><InvoicesTab /></div>
        : <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}><Profitability /></div>
      }
    </div>
  );
}

// ─── InvoicesTab — cash flow view inside Ekonomi ─────────────────────────────
function InvoicesTab() {
  const { t }                         = useLanguage();
  const { company }                   = useAuth();
  const [invoices,   setInvoices]     = useState([]);
  const [loading,    setLoading]      = useState(true);
  const [showPaid,   setShowPaid]     = useState(false);
  const [syncing,    setSyncing]      = useState(false);
  const [syncMsg,    setSyncMsg]      = useState(null);
  const [fortnoxOk,  setFortnoxOk]   = useState(false);
  const [markingPaid, setMarkingPaid] = useState(null);
  const [reminderSending, setReminderSending] = useState(null);
  const [reminderDone,    setReminderDone]    = useState(new Set());

  useEffect(() => {
    apiFetch('/api/invoices')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setInvoices(Array.isArray(d) ? d : (d.invoices ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch('/api/fortnox/status')
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setFortnoxOk(d.connected === true))
      .catch(() => {});
  }, []);

  const fmtDue = (s) => {
    if (!s) return '—';
    try { return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s + 'T12:00:00')); }
    catch { return s; }
  };

  async function handleMarkPaid(inv) {
    setMarkingPaid(inv.id);
    try {
      const r = await apiFetch(`/api/invoices/${inv.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'betald' }),
      });
      if (r.ok) setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, status: 'betald' } : i));
    } catch { /* ignore */ }
    finally { setMarkingPaid(null); }
  }

  async function handleReminder(inv) {
    setReminderSending(inv.id);
    try {
      const { generatePaminelse } = await import('./utils/generatePaminelse.js');
      const reminderCount = (inv.reminder_count ?? 0) + 1;
      const { base64, filename } = generatePaminelse(inv, company, reminderCount);

      if (inv.customer_email) {
        const r = await apiFetch(`/api/invoices/${inv.id}/reminder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: inv.customer_email, pdf_base64: base64, filename }),
        });
        if (r.ok) {
          setInvoices((prev) => prev.map((i) =>
            i.id === inv.id
              ? { ...i, reminder_sent_at: new Date().toISOString(), reminder_count: reminderCount }
              : i,
          ));
        }
      } else {
        const link = document.createElement('a');
        link.href = base64;
        link.download = filename;
        link.click();
      }
      setReminderDone((prev) => new Set([...prev, inv.id]));
    } catch { /* ignore */ }
    finally { setReminderSending(null); }
  }

  async function handleSyncFortnox() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await apiFetch('/api/invoices/sync-fortnox', { method: 'POST' });
      if (r.ok) {
        const d = await r.json();
        setSyncMsg(t.ekonomi.syncDone(d.updated ?? 0));
        const r2 = await apiFetch('/api/invoices');
        if (r2.ok) setInvoices(await r2.json());
      }
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  }

  const overdue     = invoices.filter((i) => i.status === 'förfallen');
  const outstanding = invoices.filter((i) => i.status === 'utestaende');
  const paid        = invoices.filter((i) => i.status === 'betald');

  const totalOverdue     = overdue.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalOutstanding = outstanding.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalPaid        = paid.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalToCollect   = totalOverdue + totalOutstanding;

  const cardBase = {
    background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14,
    padding: '16px 20px', boxShadow: SHADOW_SM,
  };

  function SectionHeader({ label, count, color }) {
    return (
      <div style={{
        padding: '9px 16px', background: SURF_ELV,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: color ?? TEXT_MU }}>
          {label}
        </span>
        <span style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 600,
          background: color ? `rgba(${color === D_RED ? '220,38,38' : '181,101,16'},0.09)` : SURF_ELV,
          color: color ?? TEXT_MU,
          padding: '1px 8px', borderRadius: 10,
          border: `1px solid ${color ? `rgba(${color === D_RED ? '220,38,38' : '181,101,16'},0.2)` : BORDER}`,
        }}>
          {count}
        </span>
      </div>
    );
  }

  function InvoiceRow({ inv, showActions }) {
    const isPaying   = markingPaid    === inv.id;
    const isSending  = reminderSending === inv.id;
    const doneRemind = reminderDone.has(inv.id) || !!inv.reminder_sent_at;
    const hasEmail   = !!inv.customer_email;

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 120px 120px auto',
        alignItems: 'center',
        gap: 0,
        padding: '11px 16px',
        borderBottom: `1px solid ${BORDER}`,
        background: 'transparent',
        transition: 'background 0.1s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.background = SURF_ELV; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Faktura nr */}
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: ACCENT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {inv.faktura_nr ?? `#${inv.id}`}
        </span>

        {/* Customer + overdue badge */}
        <span style={{ fontFamily: INTER, fontSize: 13, color: TEXT_PR, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
          {inv.customer_name ?? '—'}
          {inv.days_overdue > 0 && (
            <span style={{
              marginLeft: 8, fontFamily: INTER, fontSize: 10, fontWeight: 600,
              background: 'rgba(220,38,38,0.08)', color: D_RED,
              border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10,
              padding: '1px 7px', whiteSpace: 'nowrap',
            }}>
              {t.ekonomi.daysOverdue(inv.days_overdue)}
            </span>
          )}
          {doneRemind && inv.days_overdue > 0 && (
            <span style={{ marginLeft: 6, fontFamily: INTER, fontSize: 10, color: D_AMBER }}>
              ✓ {t.ekonomi.reminderSent}
            </span>
          )}
        </span>

        {/* Amount */}
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 500, color: TEXT_PR, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right', paddingRight: 16 }}>
          {fmtSEK(inv.total)}
        </span>

        {/* Due date */}
        <span style={{ fontFamily: INTER, fontSize: 12, color: inv.days_overdue > 0 ? D_RED : TEXT_SEC, whiteSpace: 'nowrap', paddingRight: 12 }}>
          {fmtDue(inv.due_date)}
        </span>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexShrink: 0 }}>
          {showActions && inv.status !== 'betald' && (
            <>
              <button
                disabled={isPaying}
                onClick={() => handleMarkPaid(inv)}
                style={{
                  fontFamily: INTER, fontSize: 11, fontWeight: 600,
                  padding: '4px 10px', borderRadius: 6,
                  background: isPaying ? SURF_ELV : ACCENT_SF,
                  color: isPaying ? TEXT_MU : ACCENT,
                  border: `1px solid ${BORDER}`,
                  cursor: isPaying ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s',
                }}
              >
                {isPaying ? t.ekonomi.markingPaid : t.ekonomi.markPaid}
              </button>
              {inv.status === 'förfallen' && (
                <button
                  disabled={isSending}
                  onClick={() => handleReminder(inv)}
                  title={!hasEmail ? t.ekonomi.noEmail : undefined}
                  style={{
                    fontFamily: INTER, fontSize: 11, fontWeight: 600,
                    padding: '4px 10px', borderRadius: 6,
                    background: isSending ? SURF_ELV : doneRemind ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.06)',
                    color: isSending ? TEXT_MU : doneRemind ? D_GREEN : D_RED,
                    border: `1px solid ${doneRemind ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.22)'}`,
                    cursor: isSending ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s',
                  }}
                >
                  {isSending
                    ? t.ekonomi.sendingReminder
                    : hasEmail
                      ? (doneRemind ? `↻ ${t.ekonomi.sendReminder}` : t.ekonomi.sendReminder)
                      : t.ekonomi.reminderDownload}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: BG_BASE }}>

      {/* Page heading + sync button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT_PR, margin: '0 0 3px', letterSpacing: '-0.02em' }}>
            {t.ekonomi.heading}
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, margin: 0 }}>
            {t.ekonomi.invoiceCount(invoices.length)}
          </p>
        </div>
        {fortnoxOk && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              disabled={syncing}
              onClick={handleSyncFortnox}
              style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 600,
                padding: '6px 14px', borderRadius: 8,
                background: syncing ? SURF_ELV : ACCENT,
                color: syncing ? TEXT_MU : '#fff',
                border: `1px solid ${syncing ? BORDER : ACCENT}`,
                cursor: syncing ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {syncing ? t.ekonomi.syncing : t.ekonomi.syncFortnox}
            </button>
            {syncMsg && (
              <span style={{ fontFamily: INTER, fontSize: 11, color: D_GREEN }}>{syncMsg}</span>
            )}
          </div>
        )}
      </div>

      {/* KPI cards */}
      {invoices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          <div style={cardBase}>
            <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: TEXT_MU, marginBottom: 8 }}>
              {t.ekonomi.toCollect}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT_PR, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {fmtSEK(totalToCollect)}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, marginTop: 6 }}>
              {t.ekonomi.invoices(overdue.length + outstanding.length)}
            </div>
          </div>
          <div style={{ ...cardBase, border: totalOverdue > 0 ? `1px solid rgba(220,38,38,0.25)` : `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: totalOverdue > 0 ? D_RED : TEXT_MU, marginBottom: 8 }}>
              {t.ekonomi.overdue}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: totalOverdue > 0 ? D_RED : TEXT_PR, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {fmtSEK(totalOverdue)}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 12, color: totalOverdue > 0 ? D_RED : TEXT_MU, marginTop: 6, opacity: 0.8 }}>
              {t.ekonomi.invoices(overdue.length)}
            </div>
          </div>
          <div style={cardBase}>
            <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: TEXT_MU, marginBottom: 8 }}>
              {t.ekonomi.paid}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: D_GREEN, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {fmtSEK(totalPaid)}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, marginTop: 6 }}>
              {t.ekonomi.invoices(paid.length)}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 40, textAlign: 'center', fontFamily: INTER, fontSize: 13, color: TEXT_MU, boxShadow: SHADOW_SM }}>
          {t.settings.loading}
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 40, textAlign: 'center', fontFamily: INTER, fontSize: 13, color: TEXT_MU, fontStyle: 'italic', boxShadow: SHADOW_SM }}>
          {t.ekonomi.noInvoices}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Overdue section */}
          {overdue.length > 0 && (
            <div style={{ background: SURF, border: `1px solid rgba(220,38,38,0.3)`, borderRadius: 16, boxShadow: SHADOW_SM, overflow: 'hidden' }}>
              <SectionHeader label={t.ekonomi.sectionOverdue} count={overdue.length} color={D_RED} />
              {overdue.map((inv) => <InvoiceRow key={inv.id} inv={inv} showActions />)}
            </div>
          )}

          {/* Outstanding section */}
          {outstanding.length > 0 && (
            <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW_SM, overflow: 'hidden' }}>
              <SectionHeader label={t.ekonomi.sectionOutstanding} count={outstanding.length} color={D_AMBER} />
              {outstanding.map((inv) => <InvoiceRow key={inv.id} inv={inv} showActions />)}
            </div>
          )}

          {/* Paid section — collapsed by default */}
          {paid.length > 0 && (
            <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW_SM, overflow: 'hidden' }}>
              <button
                onClick={() => setShowPaid((v) => !v)}
                style={{
                  width: '100%', padding: '9px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: SURF_ELV, border: 'none', cursor: 'pointer',
                  borderBottom: showPaid ? `1px solid ${BORDER}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: D_GREEN }}>
                    {t.ekonomi.sectionPaid}
                  </span>
                  <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, background: 'rgba(22,163,74,0.09)', color: D_GREEN, border: '1px solid rgba(22,163,74,0.22)', borderRadius: 10, padding: '1px 8px' }}>
                    {paid.length}
                  </span>
                </div>
                <span style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU }}>
                  {showPaid ? t.ekonomi.hidePaid : t.ekonomi.showPaid(paid.length)}
                </span>
              </button>
              {showPaid && paid.map((inv) => <InvoiceRow key={inv.id} inv={inv} showActions={false} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Legacy compound pages — kept for reference
function OperationsPage() { ... }
function FleetEnvPage() { ... }
*/

// ─── HomePage ─────────────────────────────────────────────────────────────────
function HomeKpi({ label, value, sub, accent, onClick }) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -2, boxShadow: SHADOW_CARD }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      style={{
        background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16,
        padding: '20px 22px', boxShadow: SHADOW_SM,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: TEXT_MU, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: INTER, fontSize: 26, fontWeight: 700, color: accent ?? TEXT_PR, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: INTER, fontSize: 12, color: accent ?? TEXT_SEC, marginTop: 8 }}>
          {sub}
        </div>
      )}
    </motion.div>
  );
}

function HomePage({ onNavigate }) {
  const { t, lang } = useLanguage();
  const hn = t.home ?? {};

  const [jobs,     setJobs]     = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes,   setQuotes]   = useState([]);
  const [fleet,    setFleet]    = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/jobs').then(r => r.ok ? r.json() : []).catch(() => []),
      apiFetch('/api/invoices').then(r => r.ok ? r.json() : []).catch(() => []),
      apiFetch('/api/quotes').then(r => r.ok ? r.json() : []).catch(() => []),
      apiFetch('/api/fleet').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([j, inv, q, f]) => {
      setJobs(Array.isArray(j) ? j : []);
      setInvoices(Array.isArray(inv) ? inv : []);
      setQuotes(Array.isArray(q) ? q : []);
      setFleet(Array.isArray(f) ? f : []);
      setLoading(false);
    });
  }, []);

  // KPIs
  const aktiva        = jobs.filter(j => j.status === 'aktiv').length;
  const planerade     = jobs.filter(j => j.status === 'planerad').length;
  const utestaende    = invoices.filter(i => i.status === 'utestaende').reduce((s, i) => s + (Number(i.total) || 0), 0);
  const förfallen     = invoices.filter(i => i.status === 'förfallen').reduce((s, i) => s + (Number(i.total) || 0), 0);
  const outstanding   = utestaende + förfallen;
  const slutfordNoInv = jobs.filter(j => j.status === 'avslutad' && !j.faktura_nr);
  const toInvoiceSum  = slutfordNoInv.reduce((s, j) => s + (Number(j.totalpris_sek) || 0), 0);
  const lezWarnings   = fleet.filter(v => !v.lez_godkand).length;

  // Revenue by month — last 6 months of paid invoices (ex. VAT)
  const now = new Date();
  const revenueData = Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const lbl = d.toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB', { month: 'short' });
    const val = invoices
      .filter(inv => inv.status === 'betald' && (inv.created_at ?? '').slice(0, 7) === key)
      .reduce((s, inv) => s + (Number(inv.subtotal) || 0), 0);
    return { label: lbl, value: val };
  });

  const dateStr = new Date().toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const activeJobs    = jobs.filter(j => j.status === 'aktiv' || j.status === 'planerad').slice(0, 6);
  const pendingQuotes = quotes.filter(q => q.status === 'väntande' || q.status === 'motbud').slice(0, 6);

  const ROW = { padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 };
  const PANEL = { background: SURF, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW_SM, overflow: 'hidden' };
  const PANEL_HEAD = { padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: SURF_ELV, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const VIEW_BTN = { fontFamily: INTER, fontSize: 12, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 32px 56px', background: BG_BASE }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT_PR, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {hn.heading}
        </h1>
        <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, margin: 0, textTransform: 'capitalize' }}>
          {dateStr}
        </p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <HomeKpi
          label={hn.kpiJobs}
          value={aktiva + planerade}
          sub={`${aktiva} ${hn.ongoing} · ${planerade} ${hn.planned}`}
          onClick={() => onNavigate('uppdrag')}
        />
        <HomeKpi
          label={hn.kpiToInvoice}
          value={fmtSEK(toInvoiceSum)}
          sub={slutfordNoInv.length > 0 ? `${slutfordNoInv.length} ${hn.completedJobs}` : hn.allInvoiced}
          accent={toInvoiceSum > 0 ? D_AMBER : undefined}
          onClick={() => onNavigate('ekonomi')}
        />
        <HomeKpi
          label={hn.kpiOutstanding}
          value={fmtSEK(outstanding)}
          sub={förfallen > 0 ? `${fmtSEK(förfallen)} ${hn.overdue}` : hn.noOverdue}
          accent={förfallen > 0 ? D_RED : undefined}
          onClick={() => onNavigate('ekonomi')}
        />
        <HomeKpi
          label={hn.kpiFleet}
          value={`${fleet.length - lezWarnings}/${fleet.length}`}
          sub={lezWarnings > 0 ? `${lezWarnings} ${hn.lezWarning}` : hn.lezOk}
          accent={lezWarnings > 0 ? D_AMBER : undefined}
          onClick={() => onNavigate('fleet')}
        />
      </div>

      {/* Two-column feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Active jobs */}
        <div style={PANEL}>
          <div style={PANEL_HEAD}>
            <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_PR }}>{hn.activeJobsTitle}</span>
            <button style={VIEW_BTN} onClick={() => onNavigate('uppdrag')}>{hn.viewAll} →</button>
          </div>
          {loading ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: INTER, fontSize: 13, color: TEXT_MU }}>…</div>
          ) : activeJobs.length === 0 ? (
            <div style={{ padding: '24px 20px', fontFamily: INTER, fontSize: 13, color: TEXT_MU, fontStyle: 'italic' }}>{hn.noActiveJobs}</div>
          ) : activeJobs.map(job => (
            <div key={job.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_PR }}>{job.lasttyp ?? '—'}</span>
                  {job.fordon_id && <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, fontWeight: 500 }}>{job.fordon_id}</span>}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[job.upphämtning, job.leverans].filter(Boolean).join(' → ')}
                </div>
              </div>
              <span style={{
                fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                ...(job.status === 'aktiv'
                  ? { background: 'rgba(37,99,235,0.08)',  color: '#2563eb', border: '1px solid rgba(37,99,235,0.2)' }
                  : { background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.2)' }),
              }}>
                {t.jobs.statuses[job.status] ?? job.status}
              </span>
            </div>
          ))}
        </div>

        {/* Quotes needing attention */}
        <div style={PANEL}>
          <div style={PANEL_HEAD}>
            <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_PR }}>{hn.quotesAttention}</span>
            <button style={VIEW_BTN} onClick={() => onNavigate('quotes')}>{hn.viewAll} →</button>
          </div>
          {loading ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: INTER, fontSize: 13, color: TEXT_MU }}>…</div>
          ) : pendingQuotes.length === 0 ? (
            <div style={{ padding: '24px 20px', fontFamily: INTER, fontSize: 13, color: TEXT_MU, fontStyle: 'italic' }}>{hn.noPendingQuotes}</div>
          ) : pendingQuotes.map(q => (
            <div key={q.rawId ?? q.id} style={ROW}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 500, color: TEXT_PR, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                  {q.customer_name ?? '—'}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC }}>
                  {[q.lasttyp, q.avstand_km ? `${q.avstand_km} km` : null, fmtSEK(q.totalpris_sek)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{
                fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                ...(q.status === 'motbud'
                  ? { background: 'rgba(124,58,237,0.08)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.2)' }
                  : { background: 'rgba(181,101,16,0.08)', color: '#b56510', border: '1px solid rgba(181,101,16,0.2)' }),
              }}>
                {hn.quoteStatuses?.[q.status] ?? q.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue chart */}
      <div style={PANEL}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: SURF_ELV }}>
          <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_PR }}>{hn.revenueTitle}</span>
        </div>
        <div style={{ padding: '24px 20px 16px' }}>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={revenueData} barSize={32} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fontFamily: INTER, fontSize: 12, fill: TEXT_SEC }} />
              <YAxis hide />
              <Tooltip
                formatter={(v) => [fmtSEK(v), hn.paid]}
                contentStyle={{ fontFamily: INTER, fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: SHADOW_SM }}
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {revenueData.map((_, i) => (
                  <Cell key={i} fill={i === revenueData.length - 1 ? ACCENT : '#c8cdd8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
