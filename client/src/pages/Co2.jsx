import { useState, useEffect } from 'react';
import { Leaf, TrendingDown, TrendingUp, Award, Download } from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';

const OUTFIT = "'Geist', system-ui, sans-serif";
const INTER  = OUTFIT;
const AMBER  = '#B56510';
const GREEN  = '#16a34a';
const RED    = '#dc2626';
const BG     = '#f4f5f7';
const WHITE  = '#ffffff';
const BORDER = '#ececef';
const TEXT   = '#1a1d24';
const MUTED  = '#6b7280';
const FAINT  = '#9ca3af';

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
      <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, color: MUTED, width: 80, textAlign: 'right', flexShrink: 0 }}>
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
                fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 9, color: MUTED, whiteSpace: 'nowrap',
              }}>
                {fmtNum(m.co2_tonnes, 1)}t
              </div>
            </div>
            <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 9, color: FAINT }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ t }) {
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
        {t.co2.emptyHeading}
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, maxWidth: 320, textAlign: 'center', lineHeight: 1.65 }}>
        {t.co2.emptyDesc}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Co2() {
  const { t, lang } = useLanguage();

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
          {t.co2.loading}
        </div>
      </div>
    );
  }

  const certFields = [
    { l: t.co2.cert.fields.company,   v: certData?.company },
    { l: t.co2.cert.fields.orgNr,     v: certData?.org_nr || '—' },
    { l: t.co2.cert.fields.jobs,      v: certData?.job_count },
    { l: t.co2.cert.fields.distance,  v: `${fmtNum(certData?.total_km)} km` },
    { l: t.co2.cert.fields.co2Total,  v: `${fmtNum(certData?.co2_kg, 1)} kg` },
    { l: t.co2.cert.fields.co2Tonnes, v: `${fmtNum(certData?.co2_tonnes, 2)} t` },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', animation: 'fade-in 0.3s ease' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${GREEN}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Leaf size={17} color={GREEN} strokeWidth={1.8} />
            </div>
            <h1 style={{ fontFamily: OUTFIT, fontSize: 24, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.02em' }}>
              {t.co2.title}
            </h1>
          </div>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>
            {t.co2.subtitle}
          </p>
        </div>

        {hasData && months[0] && (
          <Button variant="primary" onClick={() => loadCert(months[0].month)}>
            <Award size={14} strokeWidth={2} />
            {t.co2.getCert}
          </Button>
        )}
      </div>

      {!hasData ? (
        <EmptyState t={t} />
      ) : (
        <>
          {/* ── KPI row ──────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <StatCard
              icon={Leaf} accent={GREEN} delay={0}
              label={t.co2.stats.totalCo2}
              value={fmtNum(totals.co2_tonnes, 1)}
              unit="ton"
              sub={t.co2.stats.co2Sub(fmtNum(totals.co2_kg, 0))}
            />
            <StatCard
              icon={TrendingDown} accent={AMBER} delay={60}
              label={t.co2.stats.distance}
              value={fmtNum(totals.total_km)}
              unit="km"
              sub={t.co2.stats.totalDistance}
            />
            <StatCard
              icon={vsBench != null && better ? TrendingDown : TrendingUp}
              accent={better ? GREEN : RED}
              delay={120}
              label={t.co2.stats.vsBenchmark}
              value={vsBench != null ? `${vsBench > 0 ? '+' : ''}${fmtNum(vsBench, 1)}%` : '—'}
              sub={t.co2.stats.vsBenchSub}
            />
            <StatCard
              icon={Award} accent={AMBER} delay={180}
              label={t.co2.stats.intensity}
              value={totals.total_revenue > 0 ? fmtNum((totals.co2_kg / totals.total_revenue) * 1000, 1) : '—'}
              unit={t.co2.stats.intensityUnit}
              sub={t.co2.stats.intensitySub}
            />
          </div>

          {/* ── Middle: monthly bars + by-cargo ──────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '58fr 42fr', gap: 16 }}>

            {/* Monthly trend */}
            <Card padding="20px 22px" style={{ animation: 'card-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.1s both' }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 3 }}>
                  {t.co2.monthly.heading}
                </div>
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                  {t.co2.monthly.sub}
                </div>
              </div>
              <MonthBars months={months.slice(0, 12)} />
            </Card>

            {/* By cargo type */}
            <Card padding="20px 22px" style={{ animation: 'card-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.18s both' }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 3 }}>
                  {t.co2.cargo.heading}
                </div>
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                  {t.co2.cargo.sub}
                </div>
              </div>
              {byCargo.length === 0 ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 13, color: FAINT, textAlign: 'center', paddingTop: 20 }}>
                  {t.co2.cargo.noData}
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
            </Card>
          </div>

          {/* ── Monthly table ─────────────────────────────────────────────── */}
          <Card overflow="hidden" style={{ animation: 'card-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.22s both' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 700, color: TEXT }}>
                {t.co2.table.heading}
              </div>
              <div style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT, letterSpacing: '0.04em' }}>
                {t.co2.table.hint}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {t.co2.table.headers.map((h, i) => (
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
                        <td key="jobs" style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, color: MUTED, padding: '11px 16px', textAlign: 'right' }}>{m.job_count}</td>,
                        <td key="km" style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, color: MUTED, padding: '11px 16px', textAlign: 'right' }}>{fmtNum(m.total_km)}</td>,
                        <td key="co2kg" style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, color: TEXT, padding: '11px 16px', textAlign: 'right', fontWeight: 500 }}>{fmtNum(m.co2_kg, 1)}</td>,
                        <td key="co2t" style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, color: AMBER, padding: '11px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(m.co2_tonnes, 2)}</td>,
                        <td key="int" style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, color: MUTED, padding: '11px 16px', textAlign: 'right' }}>{m.intensity != null ? fmtNum(m.intensity, 1) : '—'}</td>,
                      ]}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

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
              {t.co2.methodology}
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
            {/* Dark header */}
            <div style={{ background: 'linear-gradient(135deg, #111118 0%, #1c1b22 100%)', padding: '24px 28px', borderBottom: `1px solid rgba(201,168,76,0.18)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Award size={22} color={AMBER} strokeWidth={1.5} />
                <div>
                  <div style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 16, color: WHITE, letterSpacing: '-0.01em' }}>
                    {t.co2.cert.title}
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
                  {t.co2.cert.generating}
                </div>
              ) : certData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {certFields.map(({ l, v }) => (
                      <div key={l} style={{ background: BG, borderRadius: 9, padding: '12px 14px' }}>
                        <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: FAINT, marginBottom: 4 }}>{l}</div>
                        <div style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 700, color: TEXT }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}20`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
                      {t.co2.cert.methodology}: {certData.methodology}
                    </div>
                    <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 10, color: FAINT, marginTop: 4 }}>
                      {t.co2.cert.generated}: {new Date(certData.generated_at).toLocaleString(lang === 'sv' ? 'sv-SE' : 'en-GB')}
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    onClick={() => {
                      const text = JSON.stringify(certData, null, 2);
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                      a.download = `co2-cert-${certMonth}.json`;
                      a.click();
                    }}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <Download size={14} strokeWidth={2} />
                    {t.co2.cert.download}
                  </Button>
                </div>
              ) : (
                <div style={{ fontFamily: OUTFIT, fontSize: 13, color: RED, textAlign: 'center', padding: '20px 0' }}>
                  {t.co2.cert.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
