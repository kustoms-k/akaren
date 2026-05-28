import { useState, useEffect } from 'react';
import { generateFaktura } from '../utils/generateFaktura.js';
import { Toast } from '../components/Toast.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER   = '#B56510';
const AMBER_DK= '#9A6410';
const BG      = '#EDECEA';
const WHITE   = '#ffffff';
const BORDER  = 'rgba(28,26,22,0.09)';
const TEXT    = '#1C1A17';
const MUTED   = '#625E58';
const FAINT   = '#A09C96';
const OUTFIT  = "'Outfit', system-ui, sans-serif";
const SURF    = '#FAF9F7';
const MONO    = "'DM Mono', monospace";

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

function truncate(str, max = 24) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function prevMonthOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function avgByKey(jobs, keyFn) {
  const sum = {}, cnt = {};
  for (const j of jobs) {
    if (j.marginal_pct == null) continue;
    const k = keyFn(j);
    sum[k] = (sum[k] ?? 0) + j.marginal_pct;
    cnt[k] = (cnt[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.keys(sum).map((k) => [k, sum[k] / cnt[k]]));
}

const COMPLETED = new Set(['avslutad', 'slutförd', 'fakturerad']);

function generateRecommendations(data, stats, prevData, t) {
  const recs = [];
  const jobs = (data?.jobs ?? []).filter((j) => COMPLETED.has(j.job_status));
  const rec  = t.profitability.recommendations;

  const marginByKund = avgByKey(jobs, (j) => j.kund);
  const worstKund = Object.entries(marginByKund)
    .map(([kund, avg]) => ({ kund, avg }))
    .sort((a, b) => a.avg - b.avg)[0];
  if (worstKund && worstKund.avg < 20) {
    const increase = Math.ceil(20 - worstKund.avg);
    const dk = truncate(worstKund.kund, 28);
    recs.push({
      id: 'raise-rate',
      type: 'warning',
      text:       rec.raiseRateText(dk, worstKund.avg.toFixed(1), increase),
      applyLabel: rec.raiseRateApply,
      toastMsg:   rec.raiseRateToast,
    });
  }

  const underused = (data?.truckUtilisation ?? [])
    .filter((v) => v.pct < 40)
    .sort((a, b) => a.pct - b.pct)[0];
  if (underused) {
    recs.push({
      id: `truck-${underused.id}`,
      type: 'info',
      text:       rec.underusedText(underused.id, underused.pct, underused.typ ?? 'flatbed'),
      applyLabel: rec.underusedApply,
      toastMsg:   rec.underusedToast(underused.id),
    });
  }

  const validJobs = jobs.filter((j) => j.lasttyp && j.lasttyp !== '—');
  const marginByType = avgByKey(validJobs, (j) => j.lasttyp);
  const bestType = Object.entries(marginByType)
    .map(([type, avg]) => ({ type, avg }))
    .sort((a, b) => b.avg - a.avg)[0];
  if (bestType && bestType.avg > 30) {
    recs.push({
      id: `cargo-${bestType.type}`,
      type: 'opportunity',
      text:       rec.cargoText(bestType.type, bestType.avg.toFixed(0)),
      applyLabel: rec.cargoApply,
      toastMsg:   rec.cargoToast,
      pitchText: `Hej! Vi erbjuder ${bestType.type} med snabb leverans och konkurrenskraftiga priser. Kontakta oss för en offert idag!`,
    });
  }

  if (stats?.acceptansgrad?.pct != null && stats.acceptansgrad.actioned >= 3 && stats.acceptansgrad.pct > 75) {
    recs.push({
      id: 'high-acceptance',
      type: 'opportunity',
      text:       rec.acceptanceText(stats.acceptansgrad.pct.toFixed(0)),
      applyLabel: rec.acceptanceApply,
      toastMsg:   rec.acceptanceToast,
    });
  }

  if (prevData) {
    const curRev   = jobs.reduce((s, j) => s + (j.intakt ?? 0), 0);
    const prevJobs = (prevData.jobs ?? []).filter((j) => COMPLETED.has(j.job_status));
    const prevRev  = prevJobs.reduce((s, j) => s + (j.intakt ?? 0), 0);
    if (prevRev > 0 && curRev < prevRev * 0.85) {
      const drop = Math.round((1 - curRev / prevRev) * 100);
      recs.push({
        id: 'revenue-drop',
        type: 'warning',
        text:       rec.revDropText(drop),
        applyLabel: rec.revDropApply,
        toastMsg:   rec.revDropToast,
      });
    }
  }

  return recs.slice(0, 5);
}

// ── KPI card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sublabel }) {
  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      padding: '22px 24px 18px', flex: 1,
    }}>
      <div style={{
        fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
        letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, marginBottom: 14,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: OUTFIT, fontSize: 26, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
          {value ?? '—'}
        </span>
        {unit && value != null && (
          <span style={{ fontFamily: OUTFIT, fontSize: 15, color: MUTED }}>{unit}</span>
        )}
      </div>
      {sublabel && (
        <div style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT, marginTop: 10 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

function marginColor(pct) {
  if (pct == null) return { text: FAINT,     bg: 'transparent' };
  if (pct < 20)    return { text: '#e74c3c', bg: '#fff0f0' };
  if (pct < 40)    return { text: '#d97706', bg: '#fff7ed' };
  return             { text: '#16a34a', bg: '#e8fdf0' };
}

function StatusBadge({ status, t }) {
  const MAP = {
    planerad:   { color: '#d97706', bg: '#fff7ed' },
    aktiv:      { color: '#15803d', bg: '#f0fdf4' },
    avslutad:   { color: '#16a34a', bg: '#e8fdf0' },
    slutförd:   { color: '#16a34a', bg: '#e8fdf0' },
    fakturerad: { color: '#3b82f6', bg: '#eff6ff' },
  };
  const s = MAP[status] ?? MAP.planerad;
  const label = t.jobs.statuses[status] ?? status;
  return (
    <span style={{
      fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', color: s.color, background: s.bg,
      padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function TrendArrow({ current, prev, showDiff = true, threshold = 0.5 }) {
  if (current == null || prev == null) {
    return <span style={{ color: FAINT, fontFamily: OUTFIT, fontSize: 12 }}>—</span>;
  }
  const diff = current - prev;
  if (Math.abs(diff) < threshold) {
    return <span style={{ color: FAINT, fontFamily: OUTFIT, fontSize: 12 }}>–</span>;
  }
  const up = diff > 0;
  return (
    <span style={{ fontFamily: OUTFIT, fontSize: 12, color: up ? '#16a34a' : '#e74c3c' }}>
      {up ? '▲' : '▼'}{showDiff ? ` ${up ? '+' : ''}${diff.toFixed(1)}%` : ''}
    </span>
  );
}

const REC_COLORS = {
  warning:     { border: '#f59e0b', bg: '#fffbeb', dot: '#f59e0b' },
  opportunity: { border: '#16a34a', bg: '#f0fdf4', dot: '#16a34a' },
  info:        { border: '#3b82f6', bg: '#eff6ff', dot: '#3b82f6' },
};

function RecommendationCards({ recs, onApply, onDismiss, t }) {
  if (recs.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <SectionLabel>{t.profitability.section.recommendations}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recs.map((rec) => {
          const c = REC_COLORS[rec.type] ?? REC_COLORS.info;
          return (
            <div key={rec.id} style={{
              background: c.bg, border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${c.border}`,
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT, lineHeight: 1.45 }}>
                  {rec.text}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onApply(rec)}
                  style={{
                    fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                    padding: '6px 12px', borderRadius: 8,
                    border: `1.5px solid ${c.border}`, background: WHITE,
                    color: c.border, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {rec.applyLabel}
                </button>
                <button
                  onClick={() => onDismiss(rec.id)}
                  style={{
                    fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, padding: '6px 10px', borderRadius: 8,
                    border: `1.5px solid ${BORDER}`, background: WHITE,
                    color: MUTED, cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobsTable({ jobs, prevJobs, onFakturaClick, t }) {
  const rows = jobs.filter((j) => COMPLETED.has(j.job_status));

  if (rows.length === 0) {
    return (
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        padding: 32, textAlign: 'center',
        fontFamily: OUTFIT, fontSize: 14, color: MUTED, fontStyle: 'italic',
      }}>
        {t.profitability.noJobs}
      </div>
    );
  }

  const prevAvgByType = avgByKey(
    (prevJobs ?? []).filter((j) => COMPLETED.has(j.job_status)),
    (j) => j.lasttyp,
  );
  const curAvgByType = avgByKey(rows, (j) => j.lasttyp);

  const COLS = [
    { label: t.profitability.tableHeaders.route,   w: '20%' },
    { label: t.profitability.tableHeaders.cargo,   w: '14%' },
    { label: t.profitability.tableHeaders.revenue, w: '14%', right: true },
    { label: t.profitability.tableHeaders.cost,    w: '14%', right: true },
    { label: t.profitability.tableHeaders.margin,  w: '12%', right: true },
    { label: 'Trend',                              w: '11%', center: true },
    { label: '',                                   w: '15%' },
  ];

  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: SURF }}>
              {COLS.map((c) => (
                <th key={c.label} style={{
                  fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED,
                  padding: '10px 16px',
                  textAlign: c.right ? 'right' : c.center ? 'center' : 'left',
                  width: c.w, whiteSpace: 'nowrap',
                  borderBottom: `1px solid ${BORDER}`,
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((j, i) => {
              const mc = marginColor(j.marginal_pct);
              return (
                <tr
                  key={j.job_id}
                  style={{
                    background: WHITE,
                    borderBottom: i < rows.length - 1 ? `1px solid ${BG}` : 'none',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = SURF}
                  onMouseLeave={(e) => e.currentTarget.style.background = WHITE}
                >
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', color: TEXT, maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncate(j.kund)}
                    </span>
                    {j.leverans && j.leverans !== '—' && (
                      <span style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT, display: 'block', marginTop: 1 }}>
                        – {truncate(j.leverans, 20)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', color: TEXT }}>{j.lasttyp}</td>
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'right', color: TEXT, fontWeight: 600 }}>{fmtSEK(j.intakt)}</td>
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'right', color: MUTED }}>{fmtSEK(j.kostnad)}</td>
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'right' }}>
                    {j.marginal_pct != null ? (
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                        fontSize: 12, fontWeight: 600,
                        color: mc.text, background: mc.bg, minWidth: 52, textAlign: 'center',
                      }}>
                        {j.marginal_pct.toFixed(1)} %
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px', textAlign: 'center' }}>
                    <TrendArrow
                      current={curAvgByType[j.lasttyp]}
                      prev={prevAvgByType[j.lasttyp]}
                    />
                  </td>
                  <td style={{ fontFamily: OUTFIT, fontSize: 13, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
                      <StatusBadge status={j.job_status} t={t} />
                      {(j.job_status === 'avslutad' || j.job_status === 'slutförd') && (
                        <button
                          onClick={() => onFakturaClick(j)}
                          style={{
                            fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                            padding: '4px 10px', borderRadius: 6,
                            border: 'none', background: AMBER, color: TEXT,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = AMBER_DK}
                          onMouseLeave={(e) => e.currentTarget.style.background = AMBER}
                        >
                          {t.profitability.generateInvoice}
                        </button>
                      )}
                      {j.job_status === 'fakturerad' && j.faktura_nr && (
                        <span style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT }}>
                          {j.faktura_nr}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 20, padding: '10px 16px', borderTop: `1px solid ${BORDER}`, background: SURF }}>
        {[
          { color: '#e74c3c', bg: '#fff0f0', label: t.profitability.legend.low  },
          { color: '#d97706', bg: '#fff7ed', label: t.profitability.legend.mid  },
          { color: '#16a34a', bg: '#e8fdf0', label: t.profitability.legend.high },
        ].map(({ color, bg, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: 2,
              background: bg, border: `1px solid ${color}`, flexShrink: 0,
            }} />
            <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>{label}</span>
          </div>
        ))}
        <span style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT, marginLeft: 'auto', fontStyle: 'italic' }}>
          {t.profitability.legend.note}
        </span>
      </div>
    </div>
  );
}

function CustomerBars({ ranking, prevRanking, t }) {
  if (ranking.length === 0) {
    return (
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        padding: 28, textAlign: 'center',
        fontFamily: OUTFIT, fontSize: 14, color: MUTED, fontStyle: 'italic',
      }}>
        {t.profitability.noJobs}
      </div>
    );
  }

  const prevByKund = Object.fromEntries((prevRanking ?? []).map((r) => [r.kund, r.profit]));
  const maxProfit = Math.max(...ranking.map((r) => Math.abs(r.profit)), 1);

  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      {ranking.map((r, i) => {
        const pct    = Math.max((Math.abs(r.profit) / maxProfit) * 100, 2);
        const isLoss = r.profit < 0;
        const prev   = prevByKund[r.kund];
        return (
          <div key={r.kund} style={{
            padding: '14px 20px',
            borderBottom: i < ranking.length - 1 ? `1px solid ${BG}` : 'none',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${pct}%`,
              background: isLoss ? 'rgba(231,76,60,0.08)' : 'rgba(201,146,30,0.10)',
              transition: 'width 0.6s ease',
            }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 700, color: FAINT, flexShrink: 0, minWidth: 16 }}>
                  {i + 1}
                </span>
                <span style={{
                  fontFamily: OUTFIT, fontSize: 15, fontWeight: 500, color: TEXT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.kund}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <TrendArrow current={r.profit} prev={prev} showDiff={false} threshold={100} />
                <span style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 700, color: isLoss ? '#e74c3c' : AMBER }}>
                  {isLoss ? '−' : ''}{fmtSEK(Math.abs(r.profit))}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
      textTransform: 'uppercase', color: MUTED, marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function Profitability() {
  const { t, lang } = useLanguage();
  const [month,          setMonth]          = useState(currentMonth);
  const [data,           setData]           = useState(null);
  const [prevData,       setPrevData]       = useState(null);
  const [stats,          setStats]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [refresh,        setRefresh]        = useState(0);
  const [fakturaJob,     setFakturaJob]     = useState(null);
  const [kundNamn,       setKundNamn]       = useState('');
  const [kundAdress,     setKundAdress]     = useState('');
  const [fakturaLoading, setFakturaLoading] = useState(false);
  const [toast,          setToast]          = useState(null);
  const [dismissed,      setDismissed]      = useState(new Set());

  const MONTH_OPTIONS = buildMonthOptions(lang);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const prev = prevMonthOf(month);
    Promise.all([
      apiFetch(`/api/profitability?month=${month}`).then((r) => r.ok ? r.json() : Promise.reject()),
      apiFetch(`/api/statistics?month=${month}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch(`/api/profitability?month=${prev}`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([profData, statsData, prevProfData]) => {
        setData(profData);
        setStats(statsData);
        setPrevData(prevProfData);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [month, refresh]);

  function openFakturaModal(job) { setFakturaJob(job); setKundNamn(''); setKundAdress(''); }

  async function handleGenerateFaktura() {
    if (!fakturaJob || !kundNamn.trim()) return;
    setFakturaLoading(true);
    try {
      const res = await apiFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: fakturaJob.job_id,
          customer_name:    kundNamn.trim(),
          customer_address: kundAdress.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const invoice = await res.json();
      await generateFaktura(invoice, invoice.company);
      setFakturaJob(null);
      setRefresh((r) => r + 1);
      setToast({ message: t.profitability.faktura.created(invoice.faktura_nr), variant: 'success' });
    } catch (e) {
      console.error('[Faktura] Fel:', e);
      setToast({ message: t.profitability.faktura.failed, variant: 'error' });
    } finally {
      setFakturaLoading(false);
    }
  }

  function handleApply(rec) {
    if (rec.pitchText) {
      navigator.clipboard.writeText(rec.pitchText).catch(() => {});
    }
    setToast({ message: rec.toastMsg, variant: 'success' });
    setDismissed((d) => new Set([...d, rec.id]));
  }

  function handleDismiss(id) {
    setDismissed((d) => new Set([...d, id]));
  }

  const avgMargin = (() => {
    if (!data?.jobs?.length) return null;
    const with_margin = data.jobs.filter((j) => j.marginal_pct != null);
    if (!with_margin.length) return null;
    return with_margin.reduce((s, j) => s + j.marginal_pct, 0) / with_margin.length;
  })();

  const allRecs = data
    ? generateRecommendations(data, stats, prevData, t).filter((r) => !dismissed.has(r.id))
    : [];

  const monthLabel = MONTH_OPTIONS.find((o) => o.value === month)?.label ?? '';

  const inputStyle = {
    width: '100%', fontFamily: OUTFIT, fontSize: 13, color: TEXT,
    border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: '9px 14px',
    outline: 'none', boxSizing: 'border-box', background: WHITE,
  };
  const labelStyle = {
    fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: FAINT, display: 'block', marginBottom: 5,
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: BG, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT, margin: '0 0 4px' }}>
            {t.profitability.heading}
          </h1>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0 }}>
            {monthLabel}
          </p>
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
          {MONTH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ fontFamily: OUTFIT, fontSize: 14, color: MUTED, textAlign: 'center', padding: 48 }}>
          {t.profitability.loading}
        </div>
      )}
      {error && (
        <div style={{ fontFamily: OUTFIT, fontSize: 14, color: '#e74c3c', textAlign: 'center', padding: 48 }}>
          {t.profitability.error}
        </div>
      )}

      {data && !loading && (
        <>
          <RecommendationCards
            recs={allRecs}
            onApply={handleApply}
            onDismiss={handleDismiss}
            t={t}
          />

          <div style={{ marginBottom: 32 }}>
            <SectionLabel>{t.profitability.section.kpi(monthLabel)}</SectionLabel>
            <div style={{ display: 'flex', gap: 12 }}>
              <KpiCard
                label={t.profitability.acceptanceRate}
                value={stats?.acceptansgrad?.pct != null ? stats.acceptansgrad.pct.toFixed(1) : null}
                unit="%"
                sublabel={
                  stats?.acceptansgrad?.actioned > 0
                    ? t.profitability.kpi.acceptanceSublabel(stats.acceptansgrad.godkand, stats.acceptansgrad.actioned)
                    : t.profitability.kpi.noAnswered
                }
              />
              <KpiCard
                label={t.profitability.avgQuote}
                value={
                  stats?.snittoffert?.avgSek != null
                    ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(stats.snittoffert.avgSek)
                    : null
                }
                unit="kr"
                sublabel={t.profitability.kpi.quotesSublabel(stats?.acceptansgrad?.total ?? 0)}
              />
              <KpiCard
                label={t.profitability.avgMargin}
                value={avgMargin != null ? avgMargin.toFixed(1) : null}
                unit="%"
                sublabel={t.profitability.kpi.marginSublabel(data.jobs.filter((j) => j.marginal_pct != null).length)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <SectionLabel>{t.profitability.section.completedJobs}</SectionLabel>
            <JobsTable
              jobs={data.jobs}
              prevJobs={prevData?.jobs}
              onFakturaClick={openFakturaModal}
              t={t}
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <SectionLabel>
              {t.profitability.section.topCustomers(Math.min(data.customerRanking.length, 5))}
            </SectionLabel>
            <CustomerBars
              ranking={data.customerRanking}
              prevRanking={prevData?.customerRanking}
              t={t}
            />
          </div>
        </>
      )}

      {fakturaJob && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(21,18,16,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.13)', padding: 28, width: 420,
          }}>
            <div style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: FAINT, marginBottom: 4 }}>
              {t.profitability.faktura.title}
            </div>
            <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, marginBottom: 16 }}>
              {t.profitability.faktura.autoNumber}
            </div>
            <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, marginBottom: 20 }}>
              {fakturaJob.lasttyp} · {fakturaJob.kund} – {fakturaJob.leverans}
              {fakturaJob.intakt != null && (
                <span style={{ color: AMBER, marginLeft: 8, fontWeight: 600 }}>{fmtSEK(fakturaJob.intakt)} {t.jobs.exclVat}</span>
              )}
            </div>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>{t.jobs.invoiceModal.customerName}</span>
              <input
                autoFocus
                value={kundNamn}
                onChange={(e) => setKundNamn(e.target.value)}
                placeholder="Företagsnamn AB"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 22 }}>
              <span style={labelStyle}>{t.jobs.invoiceModal.address}</span>
              <textarea
                value={kundAdress}
                onChange={(e) => setKundAdress(e.target.value)}
                rows={3}
                placeholder={'Gatuadress\nPostnummer Ort'}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setFakturaJob(null)}
                disabled={fakturaLoading}
                style={{
                  fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, padding: '9px 18px',
                  border: `1.5px solid ${BORDER}`, borderRadius: 8,
                  background: WHITE, color: '#374151', cursor: 'pointer',
                }}
              >
                {t.profitability.faktura.cancel}
              </button>
              <button
                onClick={handleGenerateFaktura}
                disabled={fakturaLoading || !kundNamn.trim()}
                style={{
                  fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, padding: '9px 18px',
                  border: 'none', borderRadius: 8,
                  background: fakturaLoading || !kundNamn.trim() ? '#d1d5db' : AMBER,
                  color: fakturaLoading || !kundNamn.trim() ? MUTED : TEXT,
                  cursor: fakturaLoading || !kundNamn.trim() ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => { if (!fakturaLoading && kundNamn.trim()) e.currentTarget.style.background = AMBER_DK; }}
                onMouseLeave={(e) => { if (!fakturaLoading && kundNamn.trim()) e.currentTarget.style.background = AMBER; }}
              >
                {fakturaLoading ? t.profitability.faktura.generating : t.profitability.faktura.generate}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
