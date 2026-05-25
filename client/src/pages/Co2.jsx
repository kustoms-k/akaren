import { useState, useEffect } from 'react';
import { Leaf, TrendingDown, TrendingUp, Award, Download } from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const OUTFIT = "'Outfit', system-ui, sans-serif";
const MONO   = "'DM Mono', monospace";
const AMBER  = '#c9a84c';
const GREEN  = '#22c55e';
const RED    = '#f43f5e';
const BG     = '#f5f3ee';
const WHITE  = '#ffffff';
const BORDER = '#e6e2da';
const TEXT   = '#17161a';
const MUTED  = '#6b6574';
const FAINT  = '#a09aa8';

const fmtNum = (n, dec = 0) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n);

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, sub, accent, icon: Icon, delay = 0 }) {
  return (
    <div style={{
      background: WHITE,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: '22px 22px 18px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      animation: `card-up 0.45s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: accent, borderRadius: '14px 14px 0 0',
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `${accent}14`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={17} color={accent} strokeWidth={1.8} />
        </div>
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: FAINT, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 30, fontWeight: 800, color: TEXT, lineHeight: 1, letterSpacing: '-0.025em', marginBottom: 4 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 13, fontWeight: 500, color: MUTED, marginLeft: 5, letterSpacing: 0 }}>{unit}</span>
        )}
      </div>
      {sub && (
        <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, lineHeight: 1.4, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Horizontal bar ────────────────────────────────────────────────────────────
function HBar({ label, value, max, unit = 'kg', color = AMBER, delay = 0 }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: `slide-in-left 0.35s cubic-bezier(0.22,1,0.36,1) ${delay}ms both` }}>
      <div style={{ width: 120, flexShrink: 0 }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 500, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      </div>
      <div style={{ flex: 1, height: 7, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color} 0%, ${color}bb 100%)`,
          borderRadius: 4,
          transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)',
        }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, width: 80, textAlign: 'right', flexShrink: 0 }}>
        {fmtNum(value, 0)} {unit}
      </div>
    </div>
  );
}

// ── Month bar chart ───────────────────────────────────────────────────────────
function MonthBars({ months }) {
  const maxCo2 = Math.max(...months.map((m) => m.co2_kg), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '0 4px' }}>
      {[...months].reverse().map((m, i) => {
        const h = Math.round((m.co2_kg / maxCo2) * 100);
        const label = m.month.slice(5);
        return (
          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: '100%',
              height: h,
              background: `linear-gradient(180deg, ${AMBER}ee 0%, ${AMBER}88 100%)`,
              borderRadius: '4px 4px 0 0',
              transition: `height 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 40}ms`,
              cursor: 'default',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                fontFamily: MONO, fontSize: 9, color: MUTED, whiteSpace: 'nowrap',
              }}>
                {fmtNum(m.co2_tonnes, 1)}t
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: FAINT }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ lang }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      padding: 40,
      animation: 'fade-in 0.4s ease',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: `${AMBER}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Leaf size={28} color={AMBER} strokeWidth={1.5} />
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 17, fontWeight: 700, color: TEXT, textAlign: 'center' }}>
        {lang === 'sv' ? 'Inga transportdata ännu' : 'No transport data yet'}
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, maxWidth: 320, textAlign: 'center', lineHeight: 1.65 }}>
        {lang === 'sv'
          ? 'Skapa jobb och offerter för att se ditt företags CO₂-avtryck per rutt, fordon och månad.'
          : 'Create jobs and quotes to see your company CO₂ footprint by route, vehicle, and month.'}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Co2() {
  const { lang } = useLanguage();
  const sv = lang === 'sv';

  const [summary, setSummary]     = useState(null);
  const [byCargo, setByCargo]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [certMonth, setCertMonth] = useState(null);
  const [certData, setCertData]   = useState(null);
  const [certLoading, setCertLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/api/co2/summary').then((r) => r.json()).catch(() => null),
      apiFetch('/api/co2/by-cargo').then((r) => r.json()).catch(() => []),
    ]).then(([s, c]) => {
      setSummary(s);
      setByCargo(Array.isArray(c) ? c : []);
    }).finally(() => setLoading(false));
  }, []);

  async function loadCert(month) {
    setCertMonth(month);
    setCertLoading(true);
    try {
      const r = await apiFetch(`/api/co2/certificate/${month}`);
      const d = await r.json();
      setCertData(d);
    } catch { setCertData(null); }
    finally  { setCertLoading(false); }
  }

  const totals    = summary?.totals ?? {};
  const months    = summary?.months ?? [];
  const hasData   = months.length > 0;
  const maxCargo  = Math.max(...byCargo.map((c) => c.co2_kg), 1);
  const vsBench   = totals.vs_benchmark_pct;
  const better    = vsBench != null && vsBench < 0;

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>
          {sv ? 'Laddar utsläppsdata…' : 'Loading emissions data…'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', animation: 'fade-in 0.3s ease' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${GREEN}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Leaf size={17} color={GREEN} strokeWidth={1.8} />
            </div>
            <h1 style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 800, color: TEXT, margin: 0, letterSpacing: '-0.02em' }}>
              {sv ? 'CO₂ & Utsläpp' : 'CO₂ & Emissions'}
            </h1>
          </div>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>
            {sv
              ? 'Klimatavtryck baserat på NTMCalc-faktorer och Trafikanalys 2024'
              : 'Carbon footprint based on NTMCalc factors and Trafikanalys 2024'}
          </p>
        </div>

        {hasData && months[0] && (
          <button
            onClick={() => loadCert(months[0].month)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontFamily: OUTFIT, fontSize: 12, fontWeight: 700,
              color: '#17161a', background: AMBER,
              border: 'none', borderRadius: 8, padding: '9px 16px',
              cursor: 'pointer', letterSpacing: '0.04em',
              boxShadow: '0 2px 10px rgba(201,168,76,0.28)',
              transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <Award size={14} strokeWidth={2} />
            {sv ? 'Hämta certifikat' : 'Get certificate'}
          </button>
        )}
      </div>

      {!hasData ? (
        <EmptyState lang={lang} />
      ) : (
        <>
          {/* ── KPI row ──────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <StatCard
              icon={Leaf} accent={GREEN} delay={0}
              label={sv ? 'Total CO₂' : 'Total CO₂'}
              value={fmtNum(totals.co2_tonnes, 1)}
              unit="ton"
              sub={`${fmtNum(totals.co2_kg, 0)} kg · 12 månader`}
            />
            <StatCard
              icon={TrendingDown} accent={AMBER} delay={60}
              label={sv ? 'Körda km' : 'Distance driven'}
              value={fmtNum(totals.total_km)}
              unit="km"
              sub={sv ? 'Total körsträcka' : 'Total distance'}
            />
            <StatCard
              icon={vsBench != null && better ? TrendingDown : TrendingUp}
              accent={better ? GREEN : RED}
              delay={120}
              label={sv ? 'vs. branschsnitt' : 'vs. industry avg'}
              value={vsBench != null ? `${vsBench > 0 ? '+' : ''}${fmtNum(vsBench, 1)}%` : '—'}
              sub={sv ? 'Jämfört med genomsnittligt åkeri' : 'Compared to average haulier'}
            />
            <StatCard
              icon={Award} accent={AMBER} delay={180}
              label={sv ? 'Intensitet' : 'Intensity'}
              value={totals.total_revenue > 0 ? fmtNum((totals.co2_kg / totals.total_revenue) * 1000, 1) : '—'}
              unit={sv ? 'kg/tkr' : 'kg/kSEK'}
              sub={sv ? 'CO₂ per 1 000 kr intäkt' : 'CO₂ per 1 000 SEK revenue'}
            />
          </div>

          {/* ── Middle: monthly bars + by-cargo ──────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '58fr 42fr', gap: 16 }}>

            {/* Monthly trend */}
            <div style={{
              background: WHITE, border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: '20px 22px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
              animation: 'card-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.1s both',
            }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 3 }}>
                  {sv ? 'Månadsvis CO₂ (ton)' : 'Monthly CO₂ (tonnes)'}
                </div>
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                  {sv ? 'Senaste 12 månaderna' : 'Last 12 months'}
                </div>
              </div>
              <MonthBars months={months.slice(0, 12)} />
            </div>

            {/* By cargo type */}
            <div style={{
              background: WHITE, border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: '20px 22px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
              animation: 'card-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.18s both',
            }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 3 }}>
                  {sv ? 'CO₂ per lasttyp' : 'CO₂ by cargo type'}
                </div>
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                  {sv ? 'Ackumulerat, alla månader' : 'Cumulative, all months'}
                </div>
              </div>
              {byCargo.length === 0 ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 13, color: FAINT, textAlign: 'center', paddingTop: 20 }}>
                  {sv ? 'Ingen data' : 'No data'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {byCargo.map((c, i) => (
                    <HBar
                      key={c.lasttyp}
                      label={c.lasttyp}
                      value={c.co2_kg}
                      max={maxCargo}
                      unit="kg"
                      delay={i * 50}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Monthly table ─────────────────────────────────────────────── */}
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
            animation: 'card-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.22s both',
          }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT }}>
                {sv ? 'Månadsdetaljer' : 'Monthly breakdown'}
              </div>
              <div style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT, letterSpacing: '0.04em' }}>
                {sv ? 'Klicka på en månad för certifikat' : 'Click a month for certificate'}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      sv ? 'Månad' : 'Month',
                      sv ? 'Jobb' : 'Jobs',
                      sv ? 'Km' : 'km',
                      sv ? 'CO₂ (kg)' : 'CO₂ (kg)',
                      sv ? 'CO₂ (ton)' : 'CO₂ (t)',
                      sv ? 'Intensitet' : 'Intensity',
                    ].map((h, i) => (
                      <th key={i} style={{
                        fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                        textTransform: 'uppercase', color: FAINT,
                        padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right',
                        borderBottom: `1px solid ${BORDER}`,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, idx) => (
                    <tr
                      key={m.month}
                      onClick={() => loadCert(m.month)}
                      style={{
                        cursor: 'pointer',
                        background: certMonth === m.month ? `${AMBER}08` : idx % 2 === 1 ? '#faf9f6' : WHITE,
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${AMBER}10`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = certMonth === m.month ? `${AMBER}08` : idx % 2 === 1 ? '#faf9f6' : WHITE; }}
                    >
                      {[
                        <td key="month" style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: TEXT, padding: '11px 16px' }}>{m.month}</td>,
                        <td key="jobs" style={{ fontFamily: MONO, fontSize: 12, color: MUTED, padding: '11px 16px', textAlign: 'right' }}>{m.job_count}</td>,
                        <td key="km" style={{ fontFamily: MONO, fontSize: 12, color: MUTED, padding: '11px 16px', textAlign: 'right' }}>{fmtNum(m.total_km)}</td>,
                        <td key="co2kg" style={{ fontFamily: MONO, fontSize: 12, color: TEXT, padding: '11px 16px', textAlign: 'right', fontWeight: 500 }}>{fmtNum(m.co2_kg, 1)}</td>,
                        <td key="co2t" style={{ fontFamily: MONO, fontSize: 12, color: AMBER, padding: '11px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(m.co2_tonnes, 2)}</td>,
                        <td key="int" style={{ fontFamily: MONO, fontSize: 12, color: MUTED, padding: '11px 16px', textAlign: 'right' }}>{m.intensity != null ? fmtNum(m.intensity, 1) : '—'}</td>,
                      ]}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Methodology note ──────────────────────────────────────────── */}
          <div style={{
            background: `${GREEN}08`,
            border: `1px solid ${GREEN}22`,
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex', gap: 10, alignItems: 'flex-start',
            animation: 'fade-in 0.4s ease 0.3s both',
          }}>
            <Leaf size={14} color={GREEN} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, lineHeight: 1.65 }}>
              {sv
                ? 'Utsläppsberäkningar baseras på NTMCalc-emissionsfaktorer och Trafikanalys 2024-rapport. Faktorer varierar 0,68–1,15 kg CO₂e/km beroende på fordonstyp. Dubbelräkning av returtransport ingår. Används som underlag för miljörapportering till kommuner och byggherrar.'
                : 'Emission calculations use NTMCalc factors and Trafikanalys 2024 report. Factors range 0.68–1.15 kg CO₂e/km depending on vehicle type. Round-trip factor applied. Used as supporting documentation for environmental reporting to municipalities and developers.'}
            </div>
          </div>
        </>
      )}

      {/* ── Certificate modal ──────────────────────────────────────────────── */}
      {certMonth && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(17,17,24,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
            animation: 'fade-in 0.2s ease',
          }}
          onClick={() => { setCertMonth(null); setCertData(null); }}
        >
          <div
            style={{
              background: WHITE, borderRadius: 16,
              maxWidth: 520, width: '100%',
              boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
              overflow: 'hidden',
              animation: 'card-up 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Amber header */}
            <div style={{ background: 'linear-gradient(135deg, #111118 0%, #1c1b22 100%)', padding: '24px 28px', borderBottom: `1px solid rgba(201,168,76,0.18)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Award size={22} color={AMBER} strokeWidth={1.5} />
                <div>
                  <div style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 16, color: WHITE, letterSpacing: '-0.01em' }}>
                    {sv ? 'CO₂-certifikat' : 'CO₂ Certificate'}
                  </div>
                  <div style={{ fontFamily: OUTFIT, fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {certMonth}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '24px 28px' }}>
              {certLoading ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, textAlign: 'center', padding: '20px 0' }}>
                  {sv ? 'Genererar…' : 'Generating…'}
                </div>
              ) : certData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { l: sv ? 'Företag' : 'Company',   v: certData.company },
                      { l: sv ? 'Org.nr'  : 'Reg. nr',   v: certData.org_nr || '—' },
                      { l: sv ? 'Jobb'    : 'Jobs',       v: certData.job_count },
                      { l: sv ? 'Körsträcka' : 'Distance', v: `${fmtNum(certData.total_km)} km` },
                      { l: sv ? 'CO₂ total' : 'CO₂ total', v: `${fmtNum(certData.co2_kg, 1)} kg` },
                      { l: sv ? 'CO₂ (ton)' : 'CO₂ (t)',   v: `${fmtNum(certData.co2_tonnes, 2)} t` },
                    ].map(({ l, v }) => (
                      <div key={l} style={{ background: BG, borderRadius: 9, padding: '12px 14px' }}>
                        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: FAINT, marginBottom: 4 }}>{l}</div>
                        <div style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 700, color: TEXT }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}20`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
                      {sv ? `Metodik: ${certData.methodology}` : `Methodology: ${certData.methodology}`}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, marginTop: 4 }}>
                      {sv ? 'Genererat' : 'Generated'}: {new Date(certData.generated_at).toLocaleString(sv ? 'sv-SE' : 'en-GB')}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const text = JSON.stringify(certData, null, 2);
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                      a.download = `co2-cert-${certMonth}.json`;
                      a.click();
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      fontFamily: OUTFIT, fontSize: 13, fontWeight: 700,
                      color: '#17161a', background: AMBER,
                      border: 'none', borderRadius: 8, padding: '11px',
                      cursor: 'pointer', letterSpacing: '0.04em',
                      boxShadow: '0 2px 10px rgba(201,168,76,0.28)',
                      transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <Download size={14} strokeWidth={2} />
                    {sv ? 'Ladda ned JSON' : 'Download JSON'}
                  </button>
                </div>
              ) : (
                <div style={{ fontFamily: OUTFIT, fontSize: 13, color: RED, textAlign: 'center', padding: '20px 0' }}>
                  {sv ? 'Kunde inte hämta certifikat.' : 'Could not load certificate.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
