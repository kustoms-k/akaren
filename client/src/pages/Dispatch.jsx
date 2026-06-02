import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Truck } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch } from '../utils/apiFetch.js';
import { db } from '../db/dexie.js';
import { useLanguage } from '../context/LanguageContext.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER  = '#B56510';
const BG     = '#f4f5f7';
const WHITE  = '#ffffff';
const BORDER = '#ececef';
const TEXT   = '#1a1d24';
const MUTED  = '#6b7280';
const FAINT  = '#9ca3af';
const OUTFIT = "'Geist', system-ui, sans-serif";
const INTER  = OUTFIT;


const STATUS_COLORS = {
  planerad:   { color: '#d97706', bg: '#fff7ed' },
  aktiv:      { color: '#15803d', bg: '#f0fdf4' },
  avslutad:   { color: '#6b6574', bg: '#f5f3ee' },
  fakturerad: { color: '#3b82f6', bg: '#eff6ff' },
};

const SWEDISH_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
  januari: 0, februari: 1, mars: 2, april: 3, juni: 5,
  juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11,
};


function parseJobDate(datum) {
  if (!datum) return null;
  const s = String(datum).trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(s.split('T')[0]);
    if (!isNaN(d)) return d;
  }
  const m = s.toLowerCase().match(/(\d{1,2})\s+([a-åöä]+)(?:\s+(\d{4}))?/);
  if (m) {
    const month = SWEDISH_MONTHS[m[2]];
    if (month !== undefined) {
      const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
      return new Date(year, month, parseInt(m[1]));
    }
  }
  return null;
}

function fmtDayLabel(date) {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(date);
}

function fmtSEK(n) {
  return n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status, label }) {
  const cfg = STATUS_COLORS[status] ?? STATUS_COLORS.planerad;
  return (
    <span style={{
      fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: cfg.color, background: cfg.bg,
      padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({ job, fleet, drivers, onAdvance, advancing, t }) {
  const truck    = fleet.find((f) => String(f.id) === String(job.fordon_id));
  const driver   = drivers.find((d) => String(d.truck_id) === String(job.fordon_id));
  const canStart = job.status === 'planerad';
  const canEnd   = job.status === 'aktiv';
  const busy     = advancing === job.id;
  const statusLabel = t.dispatch.statuses[job.status] ?? job.status;
  const cfg      = STATUS_COLORS[job.status] ?? STATUS_COLORS.planerad;

  return (
    <div style={{
      background: WHITE,
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: '0 6px 6px 0',
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 6,
      minWidth: 0,
    }}>
      {/* Status + price */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <StatusPill status={job.status} label={statusLabel} />
        <span style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 11, color: TEXT, fontWeight: 500, flexShrink: 0 }}>
          {fmtSEK(job.totalpris_sek)}
        </span>
      </div>

      {/* Cargo */}
      {job.lasttyp && (
        <div style={{ fontFamily: OUTFIT, color: TEXT, fontWeight: 600, fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.lasttyp}
        </div>
      )}

      {/* Route */}
      {(job.upphämtning || job.leverans) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: MUTED }}>
          <MapPin size={10} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: OUTFIT, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[job.upphämtning, job.leverans].filter(Boolean).join(' – ')}
          </span>
        </div>
      )}

      {/* Truck + driver */}
      {(truck || driver) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: FAINT }}>
          <Truck size={9} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: OUTFIT, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[truck?.namn ?? truck?.typ, driver?.name].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* Action button */}
      {(canStart || canEnd) && (
        <button
          onClick={() => onAdvance(job)}
          disabled={busy}
          style={{
            marginTop: 2,
            fontFamily: OUTFIT, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            background: canStart ? AMBER : '#16a34a',
            color: WHITE,
            border: 'none', borderRadius: 4, padding: '5px 10px',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.55 : 1,
            width: '100%',
            transition: 'opacity 150ms',
          }}
        >
          {busy ? '…' : canStart ? t.dispatch.startJob : t.dispatch.endJob}
        </button>
      )}
    </div>
  );
}

// ── Day column ────────────────────────────────────────────────────────────────
function DayColumn({ day, jobs, isToday, fleet, drivers, onAdvance, advancing, t, weekDayLabel }) {
  const count = jobs.length;
  return (
    <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px 10px',
        borderBottom: `2px solid ${isToday ? AMBER : BORDER}`,
        background: isToday ? 'rgba(181,101,16,0.06)' : 'transparent',
        borderRadius: '6px 6px 0 0',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: OUTFIT, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: isToday ? AMBER : MUTED,
          }}>
            {weekDayLabel}
          </span>
          {isToday && (
            <span style={{ fontFamily: OUTFIT, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: AMBER, background: 'rgba(181,101,16,0.14)', padding: '1px 5px', borderRadius: 3 }}>
              {t.dispatch.today}
            </span>
          )}
          {count > 0 && (
            <span style={{
              marginLeft: 'auto',
              fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 10,
              background: isToday ? AMBER : '#eef0f3',
              color: isToday ? '#ffffff' : MUTED,
              borderRadius: 10, padding: '1px 6px', flexShrink: 0,
            }}>
              {count}
            </span>
          )}
        </div>
        <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 13, color: TEXT, fontWeight: 500, marginTop: 3 }}>
          {fmtDayLabel(day)}
        </div>
      </div>

      {/* Job cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            fleet={fleet}
            drivers={drivers}
            onAdvance={onAdvance}
            advancing={advancing}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
export function Dispatch() {
  const { t, lang } = useLanguage();
  const [weekOffset, setWeekOffset] = useState(0);
  const [advancing,  setAdvancing]  = useState(null);

  const jobs    = useLiveQuery(() => db.jobs.orderBy('created_at').reverse().toArray(), [], []) ?? [];
  const fleet   = useLiveQuery(() => db.fleet.toArray(), [], []) ?? [];
  const drivers = useLiveQuery(() => db.drivers.toArray(), [], []) ?? [];

  // Build Mon–Sun for the displayed week
  const weekDays = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const locale = lang === 'sv' ? 'sv-SE' : 'en-GB';
  const weekLabel = useMemo(() => {
    const fmt = (d) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
    return `${fmt(weekDays[0])} – ${fmt(weekDays[6])} ${weekDays[6].getFullYear()}`;
  }, [weekDays, locale]);

  const weekDayLabels = useMemo(() =>
    weekDays.map((d) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).slice(0, 3)),
  [weekDays, locale]);

  const todayStr = new Date().toDateString();

  // Distribute jobs into day buckets; collect unscheduled separately
  const { byDay, unscheduled } = useMemo(() => {
    const dayKeys = weekDays.map((d) => d.toDateString());
    const map     = Object.fromEntries(dayKeys.map((k) => [k, []]));
    const unsched = [];

    for (const job of jobs) {
      if (job.status === 'fakturerad') continue;
      const date = parseJobDate(job.datum);
      if (date) {
        const key = date.toDateString();
        if (key in map) map[key].push(job);
        // jobs outside this week are silently ignored; visible in their own week
      } else {
        unsched.push(job);
      }
    }

    return { byDay: map, unscheduled: unsched };
  }, [jobs, weekDays]);

  const scheduledCount   = Object.values(byDay).reduce((s, arr) => s + arr.length, 0);
  const unscheduledCount = unscheduled.length;
  const totalVisible     = scheduledCount + unscheduledCount;

  const activeCount  = jobs.filter((j) => j.status === 'aktiv').length;
  const plannedCount = jobs.filter((j) => j.status === 'planerad').length;

  async function advanceStatus(job) {
    const nextStatus = job.status === 'planerad' ? 'aktiv' : 'avslutad';
    setAdvancing(job.id);
    try {
      const r = await apiFetch(`/api/jobs/${job.id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: nextStatus }),
      });
      if (r.ok) {
        await db.jobs.update(job.id, { status: nextStatus });
      }
    } finally {
      setAdvancing(null);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: BG }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
        background: WHITE, borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
      }}>
        {/* Title */}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: TEXT }}>
            {t.dispatch.title}
          </div>
          <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 10, color: FAINT, marginTop: 1 }}>
            {weekLabel}
            {activeCount > 0 && (
              <span style={{ marginLeft: 10, color: '#15803d', fontWeight: 600 }}>
                {t.dispatch.active(activeCount)}
              </span>
            )}
            {plannedCount > 0 && (
              <span style={{ marginLeft: 6, color: '#d97706' }}>
                {t.dispatch.planned(plannedCount)}
              </span>
            )}
          </div>
        </div>

        {/* Week nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', transition: 'border-color 150ms' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = AMBER; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            style={{
              fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
              background: weekOffset === 0 ? AMBER : WHITE,
              color: weekOffset === 0 ? '#17161a' : MUTED,
              border: `1px solid ${weekOffset === 0 ? AMBER : BORDER}`,
              borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
              transition: 'background 150ms, color 150ms, border-color 150ms',
            }}
          >
            {t.dispatch.thisWeek}
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', transition: 'border-color 150ms' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = AMBER; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Board ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Week grid */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {weekDays.map((day, idx) => (
            <DayColumn
              key={day.toDateString()}
              day={day}
              jobs={byDay[day.toDateString()]}
              isToday={day.toDateString() === todayStr}
              fleet={fleet}
              drivers={drivers}
              onAdvance={advanceStatus}
              advancing={advancing}
              t={t}
              weekDayLabel={weekDayLabels[idx]}
            />
          ))}
        </div>

        {/* Unscheduled strip */}
        {unscheduled.length > 0 && (
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
              {t.dispatch.unscheduled(unscheduledCount)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {unscheduled.map((job) => (
                <div key={job.id} style={{ width: 210 }}>
                  <JobCard
                    job={job}
                    fleet={fleet}
                    drivers={drivers}
                    onAdvance={advanceStatus}
                    advancing={advancing}
                    t={t}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalVisible === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 10 }}>
            <CalendarDays size={32} color={FAINT} />
            <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 600, color: MUTED }}>
              {t.dispatch.emptyHeading}
            </div>
            <div style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT, textAlign: 'center', maxWidth: 320 }}>
              {t.dispatch.emptyDesc}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
