import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const OUTFIT  = "'Geist', system-ui, sans-serif";
const MONO    = "'Geist Mono', monospace";
const BG      = '#f4f5f7';
const WHITE   = '#ffffff';
const BORDER  = '#ececef';
const TEXT    = '#1a1d24';
const MUTED   = '#6b7280';
const FAINT   = '#9ca3af';
const AMBER   = '#B56510';
const AMBER_BG= '#fff7ed';

const LEVEL_COLORS = {
  critical: { bg: '#fff0f0', border: '#fca5a5', text: '#dc2626', badge: '#fee2e2' },
  warning:  { bg: '#fffbeb', border: '#fcd34d', text: '#d97706', badge: '#fef3c7' },
  notice:   { bg: '#eff6ff', border: '#93c5fd', text: '#2563eb', badge: '#dbeafe' },
  ok:       { bg: '#f0fdf4', border: '#86efac', text: '#16a34a', badge: '#dcfce7' },
};

const TYPE_LABELS = {
  besiktning: 'Kontrollbesiktning',
  forsakring: 'Försäkring',
  adr:        'ADR-certifikat',
  service:    'Service',
  service_km: 'Serviceintervall (km)',
  dack:       'Däckbyte',
};

const COST_TYPES = [
  { value: 'service',     label: 'Service' },
  { value: 'reparation',  label: 'Reparation' },
  { value: 'dack',        label: 'Däck' },
  { value: 'besiktning',  label: 'Besiktning' },
  { value: 'forsakring',  label: 'Försäkring' },
  { value: 'adr',         label: 'ADR' },
  { value: 'övrigt',      label: 'Övrigt' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
};

const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtKm = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' km';

function daysLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0)  return `${Math.abs(days)} dagar sedan (förfallen!)`;
  if (days === 0) return 'Idag!';
  if (days === 1) return 'Imorgon';
  return `om ${days} dagar`;
}

function LevelBadge({ level, days }) {
  if (!level || level === 'ok') return <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>OK</span>;
  const c = LEVEL_COLORS[level];
  return (
    <span style={{
      background: c.badge, color: c.text,
      padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {daysLabel(days)}
    </span>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────
function AlertCard({ alert }) {
  const c = LEVEL_COLORS[alert.level];
  const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟠' : '🔵';
  return (
    <div style={{
      background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 10,
      padding: '14px 18px', minWidth: 240,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 700, color: c.text, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {alert.level === 'critical' ? 'Kritisk' : alert.level === 'warning' ? 'Varning' : 'Notis'}
        </span>
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>
        {alert.vehicle_id} — {alert.label}
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, marginBottom: 4 }}>
        {alert.vehicle_namn}
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 700, color: c.text }}>
        {alert.type === 'service_km'
          ? `Serviceintervall om ~${alert.days} dagar baserat på körda mil`
          : alert.datum
            ? `${fmtDate(alert.datum)} (${daysLabel(alert.days)})`
            : daysLabel(alert.days)}
      </div>
    </div>
  );
}

// ── Vehicle maintenance row ───────────────────────────────────────────────────
function VehicleRow({ vehicle, onEdit }) {
  const m = vehicle.maintenance;

  const fields = [
    { key: 'besiktning', label: 'Besiktning', datum: m.besiktning_datum, days: m.besiktning_days, level: m.besiktning_level },
    { key: 'forsakring', label: 'Försäkring', datum: m.forsakring_datum, days: m.forsakring_days, level: m.forsakring_level },
    { key: 'adr',        label: 'ADR',        datum: m.adr_datum,        days: m.adr_days,        level: m.adr_level },
    { key: 'service',    label: 'Service',    datum: m.service_datum,    days: m.service_date_days, level: m.service_date_level },
  ];

  const hasAnyAlert = fields.some((f) => f.level && f.level !== 'ok');

  return (
    <tr style={{
      background: WHITE,
      borderLeft: hasAnyAlert ? '3px solid #f59e0b' : '3px solid transparent',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = WHITE; }}
    >
      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', color: AMBER, fontWeight: 700, verticalAlign: 'middle', borderBottom: `1px solid ${BG}` }}>
        {vehicle.id}
      </td>
      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', color: TEXT, verticalAlign: 'middle', borderBottom: `1px solid ${BG}` }}>
        {vehicle.namn}
      </td>

      {fields.map((f) => (
        <td key={f.key} style={{ fontFamily: OUTFIT, fontSize: 12, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${BG}` }}>
          {f.datum || f.days !== null ? (
            <div>
              <div style={{ color: MUTED, fontSize: 11, marginBottom: 2 }}>{fmtDate(f.datum)}</div>
              <LevelBadge level={f.level} days={f.days} />
            </div>
          ) : (
            <span style={{ color: FAINT }}>—</span>
          )}
        </td>
      ))}

      {/* Service km estimation */}
      <td style={{ fontFamily: OUTFIT, fontSize: 12, padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${BG}` }}>
        {m.service_est_days !== null ? (
          <LevelBadge level={m.service_est_level} days={m.service_est_days} />
        ) : m.current_km ? (
          <span style={{ color: FAINT, fontSize: 11 }}>Otillräcklig kördata</span>
        ) : (
          <span style={{ color: FAINT }}>—</span>
        )}
      </td>

      {/* Current km */}
      <td style={{ fontFamily: OUTFIT, fontSize: 12, padding: '12px 16px', textAlign: 'right', color: MUTED, verticalAlign: 'middle', borderBottom: `1px solid ${BG}` }}>
        {m.current_km ? fmtKm(m.current_km) : <span style={{ color: FAINT }}>—</span>}
      </td>

      <td style={{ padding: '12px 16px', verticalAlign: 'middle', borderBottom: `1px solid ${BG}` }}>
        <button
          onClick={() => onEdit(vehicle)}
          style={{
            fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: AMBER,
            background: AMBER_BG, border: `1px solid ${AMBER}22`,
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
          }}
        >
          Redigera
        </button>
      </td>
    </tr>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ vehicle, onClose, onSaved }) {
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
      if (body.service_km)  body.service_km  = Number(body.service_km);
      if (body.current_km)  body.current_km  = Number(body.current_km);
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      const res = await apiFetch(`/api/underhall/${vehicle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    fontFamily: OUTFIT, fontSize: 13, color: TEXT,
    border: `1.5px solid ${BORDER}`, borderRadius: 7,
    padding: '8px 10px', width: '100%', outline: 'none', background: WHITE,
  };
  const labelStyle = { fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 4 };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: WHITE, borderRadius: 14, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontFamily: OUTFIT, fontSize: 17, fontWeight: 700, color: TEXT, margin: '0 0 4px' }}>
          {vehicle.id} — Underhållsdatum
        </h2>
        <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: '0 0 24px' }}>{vehicle.namn}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { key: 'besiktning_datum',  label: 'Kontrollbesiktning',    type: 'date' },
            { key: 'forsakring_datum',  label: 'Försäkringsförnyelse',   type: 'date' },
            { key: 'adr_datum',         label: 'ADR-certifikat förfaller', type: 'date' },
            { key: 'service_datum',     label: 'Nästa servicedatum',    type: 'date' },
            { key: 'service_km',        label: 'Serviceintervall (km)',  type: 'number' },
            { key: 'current_km',        label: 'Nuvarande mätarställning (km)', type: 'number' },
            { key: 'sommar_dack_datum', label: 'Sommarhjul monterades',  type: 'date' },
            { key: 'vinter_dack_datum', label: 'Vinterhjul monterades',  type: 'date' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: MUTED,
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '9px 18px', cursor: 'pointer',
          }}>
            Avbryt
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            fontFamily: OUTFIT, fontSize: 13, fontWeight: 700, color: WHITE,
            background: AMBER, border: 'none', borderRadius: 7, padding: '9px 22px', cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cost log ──────────────────────────────────────────────────────────────────
function CostForm({ fleet, onAdded }) {
  const [form, setForm] = useState({ vehicle_id: fleet[0]?.id ?? '', typ: 'service', beskrivning: '', belopp_sek: '', datum: new Date().toISOString().slice(0, 10), km_vid_service: '' });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function handleAdd() {
    if (!form.vehicle_id || !form.belopp_sek || !form.datum) return;
    setSaving(true);
    try {
      const body = { ...form, belopp_sek: Number(form.belopp_sek), km_vid_service: form.km_vid_service ? Number(form.km_vid_service) : null };
      if (!body.km_vid_service) delete body.km_vid_service;
      const res = await apiFetch('/api/underhall/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm({ vehicle_id: fleet[0]?.id ?? '', typ: 'service', beskrivning: '', belopp_sek: '', datum: new Date().toISOString().slice(0, 10), km_vid_service: '' });
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { fontFamily: OUTFIT, fontSize: 13, color: TEXT, border: `1.5px solid ${BORDER}`, borderRadius: 7, padding: '7px 10px', background: WHITE, outline: 'none' };

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px', background: BG, borderRadius: 10, marginBottom: 16 }}>
      <div>
        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Fordon</div>
        <select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} style={{ ...inputStyle, minWidth: 110 }}>
          {fleet.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
        </select>
      </div>
      <div>
        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Typ</div>
        <select value={form.typ} onChange={(e) => set('typ', e.target.value)} style={{ ...inputStyle, minWidth: 130 }}>
          {COST_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div style={{ flex: 2, minWidth: 160 }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Beskrivning</div>
        <input value={form.beskrivning} onChange={(e) => set('beskrivning', e.target.value)} placeholder="T.ex. Oljebyte + filter" style={{ ...inputStyle, width: '100%' }} />
      </div>
      <div>
        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Belopp (kr)</div>
        <input type="number" min="0" value={form.belopp_sek} onChange={(e) => set('belopp_sek', e.target.value)} placeholder="0" style={{ ...inputStyle, width: 110 }} />
      </div>
      <div>
        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Datum</div>
        <input type="date" value={form.datum} onChange={(e) => set('datum', e.target.value)} style={inputStyle} />
      </div>
      <div>
        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Mätarst. (km)</div>
        <input type="number" min="0" value={form.km_vid_service} onChange={(e) => set('km_vid_service', e.target.value)} placeholder="—" style={{ ...inputStyle, width: 110 }} />
      </div>
      <button
        onClick={handleAdd} disabled={saving || !form.belopp_sek}
        style={{
          fontFamily: OUTFIT, fontSize: 13, fontWeight: 700, color: WHITE,
          background: AMBER, border: 'none', borderRadius: 7, padding: '8px 18px',
          cursor: saving ? 'wait' : 'pointer', opacity: (saving || !form.belopp_sek) ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {saving ? 'Sparar…' : '+ Lägg till kostnad'}
      </button>
    </div>
  );
}

// ── Profitability warning ─────────────────────────────────────────────────────
function CostSummaryCards({ summary }) {
  if (!summary?.length) return null;

  // Flag vehicles where maintenance cost per km > 2.50 kr/km as high
  const HIGH_THRESHOLD = 2.5;

  return (
    <div>
      <h3 style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>
        Underhållskostnad per fordon
      </h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {summary.map((s) => {
          const high = s.cost_per_km != null && s.cost_per_km > HIGH_THRESHOLD;
          return (
            <div key={s.vehicle_id} style={{
              background: WHITE, border: `1.5px solid ${high ? '#fca5a5' : BORDER}`,
              borderRadius: 10, padding: '16px 18px', minWidth: 170,
            }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 700, color: high ? '#dc2626' : AMBER, marginBottom: 6 }}>
                {s.vehicle_id}
              </div>
              <div style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, marginBottom: 2 }}>{s.vehicle_namn.split(' ').slice(0, 3).join(' ')}</div>
              <div style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                {fmtSEK(s.total_sek)}
              </div>
              {s.cost_per_km != null && (
                <div style={{
                  fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                  color: high ? '#dc2626' : '#16a34a',
                  background: high ? '#fee2e2' : '#f0fdf4',
                  padding: '2px 8px', borderRadius: 5, display: 'inline-block',
                }}>
                  {s.cost_per_km.toFixed(2)} kr/km
                  {high && ' ⚠'}
                </div>
              )}
              {high && (
                <div style={{ fontFamily: OUTFIT, fontSize: 10, color: '#dc2626', marginTop: 6, lineHeight: 1.3 }}>
                  Underhållskostnad per km överstiger 2,50 kr — överväg utbyte
                </div>
              )}
              <div style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT, marginTop: 4 }}>
                {s.entries} poster
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const criticalCount = alerts.filter((a) => a.level === 'critical').length;
  const warningCount  = alerts.filter((a) => a.level === 'warning').length;

  const filteredCosts = filterVeh
    ? costs.filter((c) => c.vehicle_id === filterVeh)
    : costs;

  const tabs = [
    { id: 'overview',  label: 'Översikt' },
    { id: 'schedule',  label: 'Underhållsplan' },
    { id: 'costs',     label: 'Kostnadslogg' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: BG, minHeight: 0 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT, margin: 0 }}>
            Underhåll
          </h1>
          <button onClick={load} style={{
            fontFamily: OUTFIT, fontSize: 12, color: MUTED, background: WHITE,
            border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 14px', cursor: 'pointer',
          }}>
            Uppdatera
          </button>
        </div>
        <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0 }}>
          Proaktiv fordonsvård — besiktning, försäkring, ADR, service och däck
        </p>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Kritiska varningar', value: criticalCount, warn: criticalCount > 0, color: criticalCount > 0 ? '#dc2626' : TEXT },
            { label: 'Varningar (14 dagar)', value: warningCount, warn: warningCount > 0, color: warningCount > 0 ? '#d97706' : TEXT },
            { label: 'Totalt fordon', value: fleet.length, warn: false, color: TEXT },
            { label: 'Notiser (30 dagar)', value: alerts.filter((a) => a.level === 'notice').length, warn: false, color: '#2563eb' },
          ].map((c) => (
            <div key={c.label} style={{
              flex: 1, minWidth: 160, background: WHITE,
              border: `1.5px solid ${c.warn ? (criticalCount > 0 && c.label.includes('Kritisk') ? '#fca5a5' : '#fcd34d') : BORDER}`,
              borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontFamily: OUTFIT, fontSize: 28, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? AMBER : MUTED,
              background: activeTab === t.id ? AMBER_BG : 'transparent',
              border: `1px solid ${activeTab === t.id ? AMBER + '44' : BORDER}`,
              borderRadius: 7, padding: '7px 16px', cursor: 'pointer',
            }}
          >
            {t.label}
            {t.id === 'overview' && criticalCount > 0 && (
              <span style={{
                marginLeft: 6, background: '#dc2626', color: WHITE,
                borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px',
              }}>{criticalCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ fontFamily: OUTFIT, fontSize: 14, color: MUTED, textAlign: 'center', padding: 48 }}>
          Laddar underhållsdata…
        </div>
      )}

      {/* ── Overview tab ─────────────────────────────────────────────────── */}
      {!loading && activeTab === 'overview' && (
        <div>
          {alerts.length === 0 ? (
            <div style={{
              background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10,
              padding: '20px 24px', fontFamily: OUTFIT, fontSize: 14, color: '#16a34a', fontWeight: 600, marginBottom: 24,
            }}>
              ✓ Allt ser bra ut — inga åtgärder krävs inom 30 dagar
            </div>
          ) : (
            <>
              <h3 style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>
                Kommande åtgärder
              </h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
                {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            </>
          )}

          <CostSummaryCards summary={summary} />
        </div>
      )}

      {/* ── Schedule tab ─────────────────────────────────────────────────── */}
      {!loading && activeTab === 'schedule' && (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr style={{ background: WHITE, borderBottom: `1px solid ${BORDER}` }}>
                  {['Fordon', 'Namn', 'Besiktning', 'Försäkring', 'ADR', 'Service', 'Km-est.', 'Mätarst.', ''].map((h) => (
                    <th key={h} style={{
                      fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
                      textTransform: 'uppercase', color: MUTED, padding: '10px 16px',
                      textAlign: h === '' ? 'center' : ['Mätarst.'].includes(h) ? 'right' : ['Besiktning','Försäkring','ADR','Service','Km-est.'].includes(h) ? 'center' : 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fleet.map((v) => (
                  <VehicleRow key={v.id} vehicle={v} onEdit={setEditVehicle} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Costs tab ────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'costs' && (
        <div>
          <CostSummaryCards summary={summary} />

          <h3 style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 14px' }}>
            Ny kostnad
          </h3>
          <CostForm fleet={fleet} onAdded={load} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <h3 style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, margin: 0 }}>
              Kostnadslogg
            </h3>
            <select
              value={filterVeh}
              onChange={(e) => setFilterVeh(e.target.value)}
              style={{
                fontFamily: OUTFIT, fontSize: 12, color: TEXT,
                border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 10px',
                background: WHITE, outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">Alla fordon</option>
              {fleet.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
            </select>
          </div>

          {filteredCosts.length === 0 ? (
            <p style={{ fontFamily: OUTFIT, fontSize: 13, color: FAINT }}>Inga kostnadsposter.</p>
          ) : (
            <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: WHITE, borderBottom: `1px solid ${BORDER}` }}>
                    {['Datum', 'Fordon', 'Typ', 'Beskrivning', 'Mätarst.', 'Belopp'].map((h) => (
                      <th key={h} style={{
                        fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
                        textTransform: 'uppercase', color: MUTED, padding: '10px 16px',
                        textAlign: h === 'Belopp' ? 'right' : 'left', borderBottom: `1px solid ${BORDER}`,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCosts.map((c, i) => (
                    <tr key={c.id} style={{ background: WHITE, borderBottom: i < filteredCosts.length - 1 ? `1px solid ${BG}` : 'none' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = WHITE; }}
                    >
                      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '11px 16px', color: MUTED }}>{fmtDate(c.datum)}</td>
                      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '11px 16px', color: AMBER, fontWeight: 700 }}>{c.vehicle_id}</td>
                      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '11px 16px' }}>
                        <span style={{
                          background: BG, color: TEXT, borderRadius: 5,
                          fontSize: 11, fontWeight: 600, padding: '2px 8px',
                        }}>
                          {COST_TYPES.find((t) => t.value === c.typ)?.label ?? c.typ}
                        </span>
                      </td>
                      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '11px 16px', color: TEXT }}>{c.beskrivning ?? <span style={{ color: FAINT }}>—</span>}</td>
                      <td style={{ fontFamily: OUTFIT, fontSize: 12, padding: '11px 16px', color: MUTED }}>{c.km_vid_service ? fmtKm(c.km_vid_service) : <span style={{ color: FAINT }}>—</span>}</td>
                      <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: TEXT }}>{fmtSEK(c.belopp_sek)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: BG, borderTop: `1px solid ${BORDER}` }}>
                    <td colSpan={5} style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 600, color: MUTED, padding: '10px 16px' }}>
                      Totalt ({filteredCosts.length} poster)
                    </td>
                    <td style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, padding: '10px 16px', textAlign: 'right' }}>
                      {fmtSEK(filteredCosts.reduce((s, c) => s + c.belopp_sek, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editVehicle && (
        <EditModal
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
          onSaved={() => { setEditVehicle(null); load(); }}
        />
      )}
    </div>
  );
}
