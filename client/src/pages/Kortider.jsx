import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER = "'Geist', system-ui, sans-serif";
const MONO  = "'Geist Mono', monospace";

function fmtHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function StatusBadge({ status, t }) {
  const cfg = {
    green: { bg: 'rgba(34,197,94,0.10)',  color: '#15803d', label: t.statusGreen },
    amber: { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: t.statusAmber },
    red:   { bg: 'rgba(231,76,60,0.12)',  color: '#b91c1c', label: t.statusRed   },
  }[status] ?? { bg: '#f5f5f5', color: '#666', label: status };
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.09em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 4,
      background: cfg.bg, color: cfg.color, fontFamily: INTER,
    }}>
      {cfg.label}
    </span>
  );
}

function HoursBar({ pct, status }) {
  const color = { red: '#e74c3c', amber: '#f59e0b', green: '#22c55e' }[status] ?? '#22c55e';
  return (
    <div style={{
      height: 5, background: '#f0ede8', borderRadius: 3, overflow: 'hidden', width: '100%',
    }}>
      <div style={{
        width: `${Math.min(100, pct)}%`, height: '100%',
        background: color, borderRadius: 3,
        transition: 'width 300ms ease',
      }} />
    </div>
  );
}

function DriverRow({ driver, onLog, t }) {
  const tk         = t.kortider;
  const overallSt  = ['red', 'amber', 'green'].find(
    (s) => [driver.today.status, driver.week.status, driver.fortnight.status].includes(s)
  ) ?? 'green';

  const borderColor = { red: '#e74c3c', amber: '#f59e0b', green: 'transparent' }[overallSt];

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e6e2da',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '0 8px 8px 0',
      padding: '12px 16px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Driver info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: '#1c1917' }}>
          {driver.name}
        </span>
        <span style={{ fontFamily: MONO, fontFeatureSettings: '"tnum"', fontSize: 11, color: '#a09590' }}>
          {driver.truck_id}
        </span>
      </div>

      {/* Today */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#1c1917', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
            {fmtHM(driver.today.driving_minutes)}
          </span>
          <StatusBadge status={driver.today.status} t={tk} />
        </div>
        <HoursBar pct={driver.today.pct} status={driver.today.status} />
        <span style={{ fontFamily: INTER, fontSize: 10, color: '#a09590' }}>
          {tk.remaining(fmtHM(driver.today.remaining_minutes))} · {tk.limitDaily}
        </span>
      </div>

      {/* This week */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#1c1917', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
            {fmtHM(driver.week.driving_minutes)}
          </span>
          <StatusBadge status={driver.week.status} t={tk} />
        </div>
        <HoursBar pct={driver.week.pct} status={driver.week.status} />
        <span style={{ fontFamily: INTER, fontSize: 10, color: '#a09590' }}>
          {tk.remaining(fmtHM(driver.week.remaining_minutes))} · {tk.limitWeekly}
        </span>
      </div>

      {/* Fortnight */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#1c1917', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
            {fmtHM(driver.fortnight.driving_minutes)}
          </span>
          <StatusBadge status={driver.fortnight.status} t={tk} />
        </div>
        <HoursBar pct={driver.fortnight.pct} status={driver.fortnight.status} />
        <span style={{ fontFamily: INTER, fontSize: 10, color: '#a09590' }}>
          {tk.limitFort}
        </span>
      </div>

      {/* Log button */}
      <button
        onClick={() => onLog(driver)}
        style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 600,
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          background: 'transparent', color: '#6b6359',
          border: '1px solid #e6e2da',
          whiteSpace: 'nowrap',
        }}
      >
        {tk.logBtn}
      </button>
    </div>
  );
}

function LogModal({ driver, onClose, onSave, t }) {
  const tk = t.kortider;
  const [form, setForm]   = useState({
    date:             new Date().toISOString().slice(0, 10),
    driving_minutes:  '',
    job_id:           '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const min = parseInt(form.driving_minutes, 10);
    if (!form.date || isNaN(min) || min <= 0) return;
    setSaving(true);
    await onSave(driver.id, { ...form, driving_minutes: min });
    setSaving(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '24px 28px',
        width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: '#1c1917' }}>
          {tk.logHeading(driver.name)}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: '#6b6359' }}>
              {tk.logDate}
            </span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              style={inputStyle}
              required
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: '#6b6359' }}>
              {tk.logMinutes}
            </span>
            <input
              type="number"
              min="1"
              max="600"
              value={form.driving_minutes}
              onChange={(e) => setForm((f) => ({ ...f, driving_minutes: e.target.value }))}
              placeholder="e.g. 120"
              style={inputStyle}
              required
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: '#6b6359' }}>
              {tk.logJobId}
            </span>
            <input
              type="text"
              value={form.job_id}
              onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
              placeholder="—"
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 600,
                padding: '8px 0', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer',
                background: '#1c1917', color: '#fff', border: 'none',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? tk.logSaving : tk.logSave}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 500,
                padding: '8px 0', borderRadius: 7, cursor: 'pointer',
                background: 'transparent', color: '#6b6359',
                border: '1px solid #e6e2da',
              }}
            >
              {tk.logCancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  fontFamily: INTER, fontSize: 12, color: '#1c1917',
  background: '#fafaf8', border: '1px solid #e6e2da',
  borderRadius: 6, padding: '7px 10px', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

export function Kortider() {
  const { t }                   = useLanguage();
  const tk                      = t.kortider;
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [logModal, setLogModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/driver-hours')
      .then((r) => r.json())
      .then(setDrivers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleLog(driverId, form) {
    await apiFetch(`/api/driver-hours/${driverId}/log`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    }).catch(() => {});
    setLogModal(null);
    load();
  }

  const green = drivers.filter((d) => d.today.status === 'green' && d.week.status === 'green' && d.fortnight.status === 'green').length;
  const red   = drivers.filter((d) => d.today.status === 'red'   || d.week.status === 'red'   || d.fortnight.status === 'red').length;
  const amber = drivers.filter((d) => !['red'].includes(d.today.status + d.week.status + d.fortnight.status) && (d.today.status === 'amber' || d.week.status === 'amber' || d.fortnight.status === 'amber')).length;

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '24px 28px',
      background: 'transparent',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontFamily: INTER, fontSize: 18, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em' }}>
          {tk.title}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: '#a09590', marginTop: 3 }}>
          {tk.subtitle}
        </div>
      </div>

      {/* ── Summary chips ─────────────────────────────────────────────────── */}
      {!loading && drivers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {green > 0 && (
            <span style={{
              fontFamily: INTER, fontSize: 11, fontWeight: 600,
              padding: '4px 12px', borderRadius: 20,
              background: 'rgba(34,197,94,0.10)', color: '#15803d',
              border: '1px solid rgba(34,197,94,0.25)',
            }}>
              ✓ {tk.summaryGreen(green)}
            </span>
          )}
          {amber > 0 && (
            <span style={{
              fontFamily: INTER, fontSize: 11, fontWeight: 600,
              padding: '4px 12px', borderRadius: 20,
              background: 'rgba(245,158,11,0.10)', color: '#b45309',
              border: '1px solid rgba(245,158,11,0.28)',
            }}>
              ⚠ {tk.summaryAmber(amber)}
            </span>
          )}
          {red > 0 && (
            <span style={{
              fontFamily: INTER, fontSize: 11, fontWeight: 600,
              padding: '4px 12px', borderRadius: 20,
              background: 'rgba(231,76,60,0.10)', color: '#b91c1c',
              border: '1px solid rgba(231,76,60,0.25)',
            }}>
              ✗ {tk.summaryRed(red)}
            </span>
          )}
        </div>
      )}

      {/* ── Fine risk note ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(231,76,60,0.05)',
        border: '1px solid rgba(231,76,60,0.20)',
        borderRadius: 8, padding: '10px 14px',
        fontFamily: INTER, fontSize: 11, color: '#7f1d1d',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>⚖</span>
        {tk.fineNote}
      </div>

      {/* ── Column headers ────────────────────────────────────────────────── */}
      {!loading && drivers.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
          gap: 12, padding: '0 16px',
          fontFamily: INTER, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.09em', textTransform: 'uppercase',
          color: '#a09590',
        }}>
          <span>{tk.cols.driver}</span>
          <span>{tk.cols.today}</span>
          <span>{tk.cols.week}</span>
          <span>{tk.cols.fortnight}</span>
          <span>{tk.cols.actions}</span>
        </div>
      )}

      {/* ── Driver rows ───────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ fontFamily: INTER, fontSize: 13, color: '#a09590', padding: '20px 0' }}>
          {tk.loading}
        </div>
      )}
      {!loading && drivers.length === 0 && (
        <div style={{ fontFamily: INTER, fontSize: 13, color: '#a09590', padding: '20px 0' }}>
          {tk.noDrivers}
        </div>
      )}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drivers.map((driver) => (
            <DriverRow
              key={driver.id}
              driver={driver}
              onLog={setLogModal}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ── Regulation reference ──────────────────────────────────────────── */}
      {!loading && drivers.length > 0 && (
        <div style={{
          background: '#fafaf8', border: '1px solid #e6e2da',
          borderRadius: 8, padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a09590', marginBottom: 4 }}>
            {tk.compliance561.heading}
          </div>
          {[tk.compliance561.daily, tk.compliance561.weekly, tk.compliance561.fort].map((line) => (
            <div key={line} style={{ fontFamily: INTER, fontSize: 11, color: '#6b6359', display: 'flex', gap: 6 }}>
              <span style={{ color: '#c0bdb8' }}>—</span>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* ── Log modal ─────────────────────────────────────────────────────── */}
      {logModal && (
        <LogModal
          driver={logModal}
          onClose={() => setLogModal(null)}
          onSave={handleLog}
          t={t}
        />
      )}
    </div>
  );
}
