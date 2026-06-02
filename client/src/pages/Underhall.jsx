import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle, Wrench } from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

// ── Design tokens (aligned with system) ──────────────────────────────────────
const INTER     = "'Geist', system-ui, sans-serif";
const BG        = '#f4f5f7';
const SURF      = '#ffffff';
const ACCENT    = '#2d3340';
const ACCENT_SF = '#eef0f3';
const BORDER    = '#ececef';
const TEXT      = '#1a1d24';
const TEXT_SEC  = '#4b5563';
const TEXT_MUT  = '#6b7280';
const TEXT_FAINT= '#9ca3af';
const SHADOW    = '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)';
const D_GREEN   = '#16a34a';
const D_AMBER   = '#d97706';
const D_RED     = '#dc2626';
const D_BLUE    = '#2563eb';

const LEVEL_COLORS = {
  critical: { bg: '#fff0f0', border: '#fca5a5', text: D_RED,   badge: '#fee2e2' },
  warning:  { bg: '#fffbeb', border: '#fcd34d', text: D_AMBER, badge: '#fef3c7' },
  notice:   { bg: '#eff6ff', border: '#93c5fd', text: D_BLUE,  badge: '#dbeafe' },
  ok:       { bg: '#f0fdf4', border: '#86efac', text: D_GREEN, badge: '#dcfce7' },
};

const LEVEL_ICONS = {
  critical: AlertTriangle,
  warning:  AlertCircle,
  notice:   Info,
};

const COST_TYPES = ['service', 'reparation', 'dack', 'besiktning', 'forsakring', 'adr', 'övrigt'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (s) => {
  if (!s) return '—';
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s));
};
const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';
const fmtKm = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' km';

function daysLabel(days, t) {
  if (days === null || days === undefined) return '—';
  if (days < 0)  return t.underhall.days.overdue(days);
  if (days === 0) return t.underhall.days.today;
  if (days === 1) return t.underhall.days.tomorrow;
  return t.underhall.days.inDays(days);
}

// ── Level badge ───────────────────────────────────────────────────────────────
function LevelBadge({ level, days, t }) {
  if (!level || level === 'ok') {
    return <span style={{ color: D_GREEN, fontSize: 12, fontWeight: 600 }}>OK</span>;
  }
  const c = LEVEL_COLORS[level];
  return (
    <span style={{
      background: c.badge, color: c.text,
      padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {daysLabel(days, t)}
    </span>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────
function AlertCard({ alert, t }) {
  const c = LEVEL_COLORS[alert.level] ?? LEVEL_COLORS.notice;
  const LevelIcon = LEVEL_ICONS[alert.level] ?? Info;
  const levelLabel = t.underhall.alert[alert.level] ?? alert.level;

  return (
    <div style={{
      background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 12,
      padding: '16px 18px', minWidth: 240, boxShadow: SHADOW,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <LevelIcon size={14} color={c.text} />
        <span style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 700, color: c.text,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {levelLabel}
        </span>
      </div>
      <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>
        {alert.vehicle_id} — {t.underhall.typeLabels[alert.type] ?? alert.label}
      </div>
      <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MUT, marginBottom: 6 }}>
        {alert.vehicle_namn}
      </div>
      <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: c.text }}>
        {alert.type === 'service_km'
          ? t.underhall.alert.serviceKm(alert.days)
          : alert.datum
            ? `${fmtDate(alert.datum)} · ${daysLabel(alert.days, t)}`
            : daysLabel(alert.days, t)}
      </div>
    </div>
  );
}

// ── Vehicle maintenance row ───────────────────────────────────────────────────
function VehicleRow({ vehicle, onEdit, t }) {
  const m = vehicle.maintenance;
  const fields = [
    { key: 'besiktning', datum: m.besiktning_datum, days: m.besiktning_days, level: m.besiktning_level },
    { key: 'forsakring', datum: m.forsakring_datum, days: m.forsakring_days, level: m.forsakring_level },
    { key: 'adr',        datum: m.adr_datum,        days: m.adr_days,        level: m.adr_level },
    { key: 'service',    datum: m.service_datum,    days: m.service_date_days, level: m.service_date_level },
  ];
  const hasAlert = fields.some((f) => f.level && f.level !== 'ok');

  return (
    <tr
      style={{ background: SURF, borderLeft: `3px solid ${hasAlert ? D_AMBER : 'transparent'}` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = BG; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = SURF; }}
    >
      <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: ACCENT, fontWeight: 700, verticalAlign: 'middle', borderBottom: `1px solid ${BORDER}` }}>
        {vehicle.id}
      </td>
      <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT, verticalAlign: 'middle', borderBottom: `1px solid ${BORDER}` }}>
        {vehicle.namn}
      </td>
      {fields.map((f) => (
        <td key={f.key} style={{ fontFamily: INTER, fontSize: 12, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${BORDER}` }}>
          {f.datum || f.days !== null ? (
            <div>
              <div style={{ color: TEXT_MUT, fontSize: 11, marginBottom: 2 }}>{fmtDate(f.datum)}</div>
              <LevelBadge level={f.level} days={f.days} t={t} />
            </div>
          ) : (
            <span style={{ color: TEXT_FAINT }}>—</span>
          )}
        </td>
      ))}
      <td style={{ fontFamily: INTER, fontSize: 12, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${BORDER}` }}>
        {m.service_est_days !== null ? (
          <LevelBadge level={m.service_est_level} days={m.service_est_days} t={t} />
        ) : m.current_km ? (
          <span style={{ color: TEXT_FAINT, fontSize: 11 }}>{t.underhall.schedule.noData}</span>
        ) : (
          <span style={{ color: TEXT_FAINT }}>—</span>
        )}
      </td>
      <td style={{ fontFamily: INTER, fontSize: 12, padding: '12px 16px', textAlign: 'right', color: TEXT_MUT, verticalAlign: 'middle', borderBottom: `1px solid ${BORDER}`, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
        {m.current_km ? fmtKm(m.current_km) : <span style={{ color: TEXT_FAINT }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => onEdit(vehicle)} style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 600, color: TEXT_SEC,
          background: ACCENT_SF, border: `1px solid ${BORDER}`,
          borderRadius: 7, padding: '4px 12px', cursor: 'pointer',
        }}>
          {t.underhall.schedule.edit}
        </button>
      </td>
    </tr>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ vehicle, onClose, onSaved, t }) {
  const m = vehicle.maintenance;
  const [form, setForm] = useState({
    besiktning_datum:  m.besiktning_datum  ?? '',
    forsakring_datum:  m.forsakring_datum  ?? '',
    adr_datum:         m.adr_datum         ?? '',
    service_datum:     m.service_datum     ?? '',
    service_km:        m.service_km        ?? '',
    current_km:        m.current_km        ?? '',
    sommar_dack_datum: m.sommar_dack_datum ?? '',
    vinter_dack_datum: m.vinter_dack_datum ?? '',
  });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function handleSave() {
    setSaving(true);
    try {
      const body = { ...form };
      if (body.service_km) body.service_km = Number(body.service_km);
      if (body.current_km) body.current_km = Number(body.current_km);
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      const res = await apiFetch(`/api/underhall/${vehicle.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } finally { setSaving(false); }
  }

  const inputStyle = {
    fontFamily: INTER, fontSize: 13, color: TEXT,
    border: `1.5px solid ${BORDER}`, borderRadius: 8,
    padding: '8px 10px', width: '100%', outline: 'none', background: BG, boxSizing: 'border-box',
  };
  const labelStyle = {
    fontFamily: INTER, fontSize: 11, fontWeight: 600, color: TEXT_MUT,
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  const fields = [
    { key: 'besiktning_datum',  label: t.underhall.edit.inspection, type: 'date' },
    { key: 'forsakring_datum',  label: t.underhall.edit.insurance,  type: 'date' },
    { key: 'adr_datum',         label: t.underhall.edit.adr,        type: 'date' },
    { key: 'service_datum',     label: t.underhall.edit.service,    type: 'date' },
    { key: 'service_km',        label: t.underhall.edit.serviceKm,  type: 'number' },
    { key: 'current_km',        label: t.underhall.edit.odometer,   type: 'number' },
    { key: 'sommar_dack_datum', label: t.underhall.edit.summerTyre, type: 'date' },
    { key: 'vinter_dack_datum', label: t.underhall.edit.winterTyre, type: 'date' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: SURF, borderRadius: 18, padding: '28px 32px',
        width: 520, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT, margin: '0 0 4px' }}>
          {vehicle.id} — {t.underhall.edit.title}
        </h2>
        <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '0 0 24px' }}>{vehicle.namn}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {fields.map(({ key, label, type }) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} style={inputStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_MUT,
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
          }}>
            {t.underhall.edit.cancel}
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            fontFamily: INTER, fontSize: 13, fontWeight: 700, color: '#fff',
            background: ACCENT, border: 'none', borderRadius: 8, padding: '9px 22px',
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? t.underhall.edit.saving : t.underhall.edit.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cost form ─────────────────────────────────────────────────────────────────
function CostForm({ fleet, onAdded, t }) {
  const [form, setForm] = useState({
    vehicle_id: fleet[0]?.id ?? '', typ: 'service', beskrivning: '',
    belopp_sek: '', datum: new Date().toISOString().slice(0, 10), km_vid_service: '',
  });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function handleAdd() {
    if (!form.vehicle_id || !form.belopp_sek || !form.datum) return;
    setSaving(true);
    try {
      const body = { ...form, belopp_sek: Number(form.belopp_sek), km_vid_service: form.km_vid_service ? Number(form.km_vid_service) : null };
      if (!body.km_vid_service) delete body.km_vid_service;
      const res = await apiFetch('/api/underhall/costs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm({ vehicle_id: fleet[0]?.id ?? '', typ: 'service', beskrivning: '', belopp_sek: '', datum: new Date().toISOString().slice(0, 10), km_vid_service: '' });
      onAdded();
    } finally { setSaving(false); }
  }

  const inp = {
    fontFamily: INTER, fontSize: 13, color: TEXT,
    border: `1.5px solid ${BORDER}`, borderRadius: 8,
    padding: '7px 10px', background: SURF, outline: 'none',
  };
  const lbl = {
    fontFamily: INTER, fontSize: 10, fontWeight: 700, color: TEXT_MUT,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px', background: BG, borderRadius: 12, marginBottom: 16 }}>
      <div>
        <span style={lbl}>{t.underhall.costs.form.vehicle}</span>
        <select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} style={{ ...inp, minWidth: 110 }}>
          {fleet.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
        </select>
      </div>
      <div>
        <span style={lbl}>{t.underhall.costs.form.type}</span>
        <select value={form.typ} onChange={(e) => set('typ', e.target.value)} style={{ ...inp, minWidth: 130 }}>
          {COST_TYPES.map((c) => <option key={c} value={c}>{t.underhall.costs.types[c] ?? c}</option>)}
        </select>
      </div>
      <div style={{ flex: 2, minWidth: 160 }}>
        <span style={lbl}>{t.underhall.costs.form.description}</span>
        <input value={form.beskrivning} onChange={(e) => set('beskrivning', e.target.value)}
          placeholder={t.underhall.costs.form.placeholder}
          style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div>
        <span style={lbl}>{t.underhall.costs.form.amount}</span>
        <input type="number" min="0" value={form.belopp_sek} onChange={(e) => set('belopp_sek', e.target.value)}
          placeholder="0" style={{ ...inp, width: 110 }} />
      </div>
      <div>
        <span style={lbl}>{t.underhall.costs.form.date}</span>
        <input type="date" value={form.datum} onChange={(e) => set('datum', e.target.value)} style={inp} />
      </div>
      <div>
        <span style={lbl}>{t.underhall.costs.form.odometer}</span>
        <input type="number" min="0" value={form.km_vid_service} onChange={(e) => set('km_vid_service', e.target.value)}
          placeholder="—" style={{ ...inp, width: 110 }} />
      </div>
      <button onClick={handleAdd} disabled={saving || !form.belopp_sek} style={{
        fontFamily: INTER, fontSize: 13, fontWeight: 700, color: '#fff',
        background: ACCENT, border: 'none', borderRadius: 8, padding: '8px 18px',
        cursor: (saving || !form.belopp_sek) ? 'not-allowed' : 'pointer',
        opacity: (saving || !form.belopp_sek) ? 0.6 : 1, whiteSpace: 'nowrap',
      }}>
        {saving ? t.underhall.costs.adding : t.underhall.costs.add}
      </button>
    </div>
  );
}

// ── Cost summary cards ────────────────────────────────────────────────────────
function CostSummaryCards({ summary, t }) {
  if (!summary?.length) return null;
  const HIGH = 2.5;

  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>
        {t.underhall.costs.heading}
      </h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {summary.map((s) => {
          const high = s.cost_per_km != null && s.cost_per_km > HIGH;
          return (
            <div key={s.vehicle_id} style={{
              background: SURF, border: `1.5px solid ${high ? '#fca5a5' : BORDER}`,
              borderRadius: 12, padding: '16px 18px', minWidth: 170, boxShadow: SHADOW,
            }}>
              <div style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, color: high ? D_RED : TEXT, marginBottom: 6 }}>
                {s.vehicle_id}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginBottom: 4 }}>
                {s.vehicle_namn.split(' ').slice(0, 3).join(' ')}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 4, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                {fmtSEK(s.total_sek)}
              </div>
              {s.cost_per_km != null && (
                <div style={{
                  fontFamily: INTER, fontSize: 12, fontWeight: 600,
                  color: high ? D_RED : D_GREEN,
                  background: high ? '#fee2e2' : '#f0fdf4',
                  padding: '2px 8px', borderRadius: 5, display: 'inline-block',
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.cost_per_km.toFixed(2)} kr/km{high && ' ⚠'}
                </div>
              )}
              {high && (
                <div style={{ fontFamily: INTER, fontSize: 10, color: D_RED, marginTop: 6, lineHeight: 1.4 }}>
                  {t.underhall.costs.highThreshold}
                </div>
              )}
              <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_FAINT, marginTop: 4 }}>
                {t.underhall.costs.entries(s.entries)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Underhall() {
  const { t } = useLanguage();
  const [fleet,       setFleet]       = useState([]);
  const [alerts,      setAlerts]      = useState([]);
  const [costs,       setCosts]       = useState([]);
  const [summary,     setSummary]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editVehicle, setEditVehicle] = useState(null);
  const [activeTab,   setActiveTab]   = useState('overview');
  const [filterVeh,   setFilterVeh]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fleetRes, alertsRes, costsRes] = await Promise.all([
        apiFetch('/api/underhall').then((r) => r.ok ? r.json() : []),
        apiFetch('/api/underhall/alerts').then((r) => r.ok ? r.json() : []),
        apiFetch('/api/underhall/costs').then((r) => r.ok ? r.json() : { costs: [], summary: [] }),
      ]);
      setFleet(fleetRes);
      setAlerts(alertsRes);
      setCosts(costsRes.costs ?? []);
      setSummary(costsRes.summary ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const criticalCount = alerts.filter((a) => a.level === 'critical').length;
  const warningCount  = alerts.filter((a) => a.level === 'warning').length;
  const filteredCosts = filterVeh ? costs.filter((c) => c.vehicle_id === filterVeh) : costs;

  const tabs = [
    { id: 'overview', label: t.underhall.tabs.overview },
    { id: 'schedule', label: t.underhall.tabs.schedule },
    { id: 'costs',    label: t.underhall.tabs.costs },
  ];

  const kpiCards = [
    { label: t.underhall.kpi.critical, value: criticalCount, color: criticalCount > 0 ? D_RED   : TEXT, warnColor: '#fca5a5' },
    { label: t.underhall.kpi.warning,  value: warningCount,  color: warningCount > 0  ? D_AMBER : TEXT, warnColor: '#fcd34d' },
    { label: t.underhall.kpi.total,    value: fleet.length,  color: TEXT,                               warnColor: null },
    { label: t.underhall.kpi.notices,  value: alerts.filter((a) => a.level === 'notice').length, color: D_BLUE, warnColor: null },
  ];

  const scheduleHeaders = [
    t.underhall.schedule.vehicle, t.underhall.schedule.name,
    t.underhall.schedule.inspection, t.underhall.schedule.insurance,
    t.underhall.schedule.adr, t.underhall.schedule.service,
    t.underhall.schedule.kmEst, t.underhall.schedule.odometer, '',
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 48px', background: BG, minHeight: 0, fontFamily: INTER }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: ACCENT_SF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wrench size={16} color={ACCENT} />
            </div>
            <h1 style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.02em' }}>
              {t.underhall.title}
            </h1>
          </div>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '0 0 0 46px' }}>
            {t.underhall.subtitle}
          </p>
        </div>
        <button onClick={load} style={{
          fontFamily: INTER, fontSize: 12, color: TEXT_MUT, background: SURF,
          border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 16px', cursor: 'pointer',
        }}>
          {t.underhall.refresh}
        </button>
      </div>

      {/* KPI row */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {kpiCards.map((c) => (
            <div key={c.label} style={{
              background: SURF,
              border: `1.5px solid ${c.warnColor && c.value > 0 ? c.warnColor : BORDER}`,
              borderRadius: 14, padding: '18px 20px', boxShadow: SHADOW,
            }}>
              <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {c.label}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 28, fontWeight: 800, color: c.value > 0 ? c.color : TEXT, lineHeight: 1, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            fontFamily: INTER, fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
            color: activeTab === tab.id ? TEXT : TEXT_MUT,
            background: activeTab === tab.id ? SURF : 'transparent',
            borderBottom: activeTab === tab.id ? `2px solid ${ACCENT}` : '2px solid transparent',
            border: 'none', borderRadius: '8px 8px 0 0',
            padding: '8px 18px', cursor: 'pointer',
          }}>
            {tab.label}
            {tab.id === 'overview' && criticalCount > 0 && (
              <span style={{ marginLeft: 6, background: D_RED, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                {criticalCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, textAlign: 'center', padding: 48 }}>
          {t.underhall.loading}
        </div>
      )}

      {/* ── Overview ─── */}
      {!loading && activeTab === 'overview' && (
        <div>
          {alerts.length === 0 ? (
            <div style={{
              background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12,
              padding: '20px 24px', fontFamily: INTER, fontSize: 14, color: D_GREEN, fontWeight: 600, marginBottom: 24,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <CheckCircle size={16} color={D_GREEN} />
              {t.underhall.alert.allClear}
            </div>
          ) : (
            <>
              <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>
                {t.underhall.alert.upcoming}
              </h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
                {alerts.map((a, i) => <AlertCard key={i} alert={a} t={t} />)}
              </div>
            </>
          )}
          <CostSummaryCards summary={summary} t={t} />
        </div>
      )}

      {/* ── Schedule ─── */}
      {!loading && activeTab === 'schedule' && (
        <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: SHADOW }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                  {scheduleHeaders.map((h, i) => (
                    <th key={i} style={{
                      fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                      textTransform: 'uppercase', color: TEXT_MUT, padding: '10px 16px',
                      textAlign: i >= 2 && i <= 6 ? 'center' : i === 7 ? 'right' : 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fleet.map((v) => <VehicleRow key={v.id} vehicle={v} onEdit={setEditVehicle} t={t} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Costs ─── */}
      {!loading && activeTab === 'costs' && (
        <div>
          <CostSummaryCards summary={summary} t={t} />
          <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 12px' }}>
            {t.underhall.costs.newCost}
          </h3>
          <CostForm fleet={fleet} onAdded={load} t={t} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT, margin: 0 }}>
              {t.underhall.costs.log}
            </h3>
            <select value={filterVeh} onChange={(e) => setFilterVeh(e.target.value)} style={{
              fontFamily: INTER, fontSize: 12, color: TEXT,
              border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 10px',
              background: SURF, outline: 'none', cursor: 'pointer',
            }}>
              <option value="">{t.underhall.costs.allVehicles}</option>
              {fleet.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
            </select>
          </div>

          {filteredCosts.length === 0 ? (
            <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_FAINT }}>{t.underhall.costs.noCosts}</p>
          ) : (
            <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: SHADOW }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                    {[
                      t.underhall.costs.table.date,
                      t.underhall.costs.table.vehicle,
                      t.underhall.costs.table.type,
                      t.underhall.costs.table.description,
                      t.underhall.costs.table.odometer,
                      t.underhall.costs.table.amount,
                    ].map((h) => (
                      <th key={h} style={{
                        fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                        textTransform: 'uppercase', color: TEXT_MUT, padding: '10px 16px',
                        textAlign: h === t.underhall.costs.table.amount ? 'right' : 'left',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCosts.map((c, i) => (
                    <tr key={c.id}
                      style={{ background: SURF }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = BG; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = SURF; }}
                    >
                      <td style={{ fontFamily: INTER, fontSize: 13, padding: '11px 16px', color: TEXT_MUT, borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        {fmtDate(c.datum)}
                      </td>
                      <td style={{ fontFamily: INTER, fontSize: 13, padding: '11px 16px', color: ACCENT, fontWeight: 700, borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        {c.vehicle_id}
                      </td>
                      <td style={{ fontFamily: INTER, fontSize: 13, padding: '11px 16px', borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        <span style={{ background: BG, color: TEXT, borderRadius: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px' }}>
                          {t.underhall.costs.types[c.typ] ?? c.typ}
                        </span>
                      </td>
                      <td style={{ fontFamily: INTER, fontSize: 13, padding: '11px 16px', color: TEXT, borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        {c.beskrivning ?? <span style={{ color: TEXT_FAINT }}>—</span>}
                      </td>
                      <td style={{ fontFamily: INTER, fontSize: 12, padding: '11px 16px', color: TEXT_MUT, borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BORDER}` : 'none', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                        {c.km_vid_service ? fmtKm(c.km_vid_service) : <span style={{ color: TEXT_FAINT }}>—</span>}
                      </td>
                      <td style={{ fontFamily: INTER, fontSize: 13, padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: TEXT, borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BORDER}` : 'none', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtSEK(c.belopp_sek)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: BG, borderTop: `1px solid ${BORDER}` }}>
                    <td colSpan={5} style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: TEXT_MUT, padding: '10px 16px' }}>
                      {t.underhall.costs.total(filteredCosts.length)}
                    </td>
                    <td style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT, padding: '10px 16px', textAlign: 'right', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtSEK(filteredCosts.reduce((s, c) => s + c.belopp_sek, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {editVehicle && (
        <EditModal
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
          onSaved={() => { setEditVehicle(null); load(); }}
          t={t}
        />
      )}
    </div>
  );
}
