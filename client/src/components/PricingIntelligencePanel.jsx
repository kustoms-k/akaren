import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER  = "'Geist', system-ui, sans-serif";
const MONO   = "'Geist', system-ui, sans-serif";
const TEXT   = '#1a1d24';
const MUTED  = '#6b7280';
const FAINT  = '#9ca3af';
const BORDER = '#ececef';
const WHITE  = '#ffffff';
const SURF   = '#f4f5f7';
const ACCENT = '#2d3340';

const G_GREEN = '#16a34a';
const G_RED   = '#dc2626';
const G_AMBER = '#b56510';

const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

function marginColor(pct) {
  if (pct == null) return MUTED;
  if (pct < 0)    return G_RED;
  if (pct < 5)    return G_RED;
  if (pct < 10)   return G_AMBER;
  if (pct >= 20)  return G_GREEN;
  return TEXT;
}

function TierBar({ label, rate, count, highlight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, width: 82, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 3, background: SURF, borderRadius: 2 }}>
        <div style={{
          width: `${Math.round(rate * 100)}%`, height: '100%',
          background: highlight ? ACCENT : '#d1d5db',
          borderRadius: 2, transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        fontFamily: MONO, fontSize: 11,
        color: highlight ? ACCENT : FAINT,
        width: 30, textAlign: 'right', flexShrink: 0,
        fontFeatureSettings: '"tnum"',
      }}>
        {Math.round(rate * 100)}%
      </span>
      <span style={{
        fontFamily: MONO, fontSize: 10, color: FAINT,
        width: 30, flexShrink: 0, fontFeatureSettings: '"tnum"',
      }}>
        n={count}
      </span>
    </div>
  );
}

export function PricingIntelligencePanel({ lasttyp, currentPrice, parsed, onApplyPrice }) {
  const { t } = useLanguage();
  const pi    = t.pricingIntel;
  const insights = useLiveQuery(() => db.pricingInsights.toArray(), [], null);

  // ── Cost floor from analysis data ────────────────────────────────────────
  const arbetstid = parsed?.arbetstid_kostnad != null ? Number(parsed.arbetstid_kostnad) : null;
  const bränsle   = parsed?.bränsle_kostnad   != null ? Number(parsed.bränsle_kostnad)   : null;
  const timmar    = parsed?.arbetstid_timmar  != null ? Number(parsed.arbetstid_timmar)  : null;
  const hasCost   = arbetstid != null || bränsle != null;
  const costFloor = (arbetstid ?? 0) + (bränsle ?? 0);

  // Margin
  const marginKr  = hasCost ? Math.round(currentPrice - costFloor) : null;
  const marginPct = hasCost && currentPrice > 0
    ? Math.round((marginKr / currentPrice) * 100)
    : null;
  const isBelowCost = marginKr != null && marginKr < 0;

  // ── Historical data ───────────────────────────────────────────────────────
  const statusInsight = insights?.find((i) => i.insight_type === 'status');
  const cargoInsight  = insights?.find((i) => i.insight_type === 'cargo_type_margin');
  const tierInsight   = insights?.find((i) => i.insight_type === 'price_tier_acceptance');

  const unlocked  = statusInsight?.insight_data?.unlocked ?? false;
  const accCount  = statusInsight?.insight_data?.accepted_count ?? 0;
  const threshold = statusInsight?.insight_data?.threshold ?? 30;

  const cargoItem  = lasttyp && cargoInsight
    ? cargoInsight.insight_data.items?.find((i) => i.lasttyp === lasttyp)
    : null;
  const hasHistory = cargoItem != null && cargoItem.n >= 3;
  const histAvg    = hasHistory ? cargoItem.avg_price : null;
  const histN      = hasHistory ? cargoItem.n : 0;

  // What's the average margin they earn on similar jobs?
  const histMarginKr  = histAvg != null && hasCost ? Math.round(histAvg - costFloor) : null;
  const histMarginPct = histMarginKr != null && histAvg > 0
    ? Math.round((histMarginKr / histAvg) * 100)
    : null;

  // How does this quote compare to their historical average?
  const pctVsHist   = histAvg != null ? (currentPrice - histAvg) / histAvg : null;
  const isBelowHist = pctVsHist != null && pctVsHist < -0.03;

  // ── Tier acceptance ───────────────────────────────────────────────────────
  const tierData    = tierInsight?.insight_data?.by_cargo_type?.[lasttyp];
  const currentTier = pctVsHist == null ? 'at'
    : pctVsHist < -0.10 ? 'below'
    : pctVsHist >  0.10 ? 'above'
    : 'at';
  const winRate = tierData?.[currentTier]?.acceptance_rate ?? null;
  const bestTier = tierData
    ? ['below', 'at', 'above'].reduce(
        (b, k) => (tierData[k]?.acceptance_rate ?? 0) > (tierData[b]?.acceptance_rate ?? 0) ? k : b,
        'at',
      )
    : null;

  // ── Notice logic ─────────────────────────────────────────────────────────
  const noticeRed   = isBelowCost || (marginPct != null && marginPct < 5);
  const noticeAmber = !noticeRed && (
    (marginPct != null && marginPct < 15) ||
    (isBelowHist && hasHistory)
  );
  const showNotice = noticeRed || noticeAmber;

  function noticeText() {
    if (isBelowCost) {
      return pi.noticeBelowCost(fmtSEK(Math.abs(marginKr)));
    }
    if (marginPct != null && marginPct < 15 && histMarginPct != null) {
      return pi.noticeLowMarginWithHist(marginPct, histMarginPct);
    }
    if (marginPct != null && marginPct < 15) {
      return pi.noticeLowMargin(marginPct);
    }
    if (isBelowHist && marginPct != null && histMarginPct != null) {
      return pi.noticeBelowHist(marginPct, histMarginPct);
    }
    return null;
  }

  const notice = showNotice ? noticeText() : null;

  // ── Bail if nothing to show ───────────────────────────────────────────────
  if (!hasCost && !hasHistory && (!insights || insights.length === 0)) return null;

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Notice banner ── */}
      {notice && (
        <div style={{
          padding: '11px 14px',
          background: noticeRed
            ? 'rgba(220,38,38,0.06)'
            : 'rgba(181,101,16,0.07)',
          border: `1.5px solid ${noticeRed
            ? 'rgba(220,38,38,0.30)'
            : 'rgba(181,101,16,0.30)'}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            background: noticeRed ? 'rgba(220,38,38,0.12)' : 'rgba(181,101,16,0.12)',
            border: `1px solid ${noticeRed ? 'rgba(220,38,38,0.30)' : 'rgba(181,101,16,0.30)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: INTER, fontSize: 10, fontWeight: 800,
            color: noticeRed ? G_RED : G_AMBER,
            lineHeight: 1, marginTop: 1,
          }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 500, lineHeight: 1.5,
              color: noticeRed ? '#991b1b' : '#78350f',
            }}>
              {notice}
            </div>
            {histAvg != null && onApplyPrice && (
              <button
                onClick={() => onApplyPrice(Math.round(histAvg / 100) * 100)}
                style={{
                  marginTop: 8,
                  fontFamily: INTER, fontSize: 12, fontWeight: 600,
                  background: noticeRed
                    ? 'rgba(220,38,38,0.09)'
                    : 'rgba(181,101,16,0.09)',
                  color: noticeRed ? G_RED : G_AMBER,
                  border: `1px solid ${noticeRed ? 'rgba(220,38,38,0.25)' : 'rgba(181,101,16,0.25)'}`,
                  borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                }}
              >
                {pi.adjustToAvg(fmtSEK(Math.round(histAvg / 100) * 100))}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main panel ── */}
      <div style={{
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px',
          background: '#fafbfc',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: INTER, fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED,
          }}>
            {pi.heading}
          </span>
          {hasHistory && (
            <span style={{ fontFamily: INTER, fontSize: 10, color: FAINT }}>
              {pi.histJobs(histN, lasttyp)}
            </span>
          )}
        </div>

        <div style={{ padding: '14px' }}>

          {/* Cost floor breakdown */}
          {hasCost && (
            <div style={{ marginBottom: 12 }}>
              {arbetstid != null && (
                <CostRow label={pi.labour(timmar)} value={fmtSEK(arbetstid)} />
              )}
              {bränsle != null && (
                <CostRow label={pi.fuel} value={fmtSEK(bränsle)} />
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingTop: 6, marginTop: 4,
                borderTop: `1px solid ${BORDER}`,
              }}>
                <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: TEXT }}>
                  {pi.totalCost}
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT,
                  fontFeatureSettings: '"tnum"',
                }}>
                  {fmtSEK(costFloor)}
                </span>
              </div>
            </div>
          )}

          {/* Price + margin readout */}
          <div style={{
            background: SURF, borderRadius: 8, padding: '10px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: (hasHistory || tierData || (!hasHistory && insights !== null && !unlocked)) ? 14 : 0,
          }}>
            <div>
              <div style={{
                fontFamily: INTER, fontSize: 10, fontWeight: 600,
                letterSpacing: '0.07em', textTransform: 'uppercase',
                color: FAINT, marginBottom: 4,
              }}>
                {pi.quotePrice}
              </div>
              <div style={{
                fontFamily: MONO, fontSize: 19, fontWeight: 700,
                color: TEXT, letterSpacing: '-0.02em',
                fontFeatureSettings: '"tnum"',
              }}>
                {fmtSEK(currentPrice)}
              </div>
            </div>
            {marginKr != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: INTER, fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  color: FAINT, marginBottom: 4,
                }}>
                  {pi.margin}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 19, fontWeight: 700,
                  color: marginColor(marginPct), letterSpacing: '-0.02em',
                  fontFeatureSettings: '"tnum"',
                }}>
                  {marginPct}%
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 11, fontWeight: 500,
                  color: marginColor(marginPct), opacity: 0.75,
                  fontFeatureSettings: '"tnum"',
                }}>
                  {fmtSEK(marginKr)}
                </div>
              </div>
            )}
          </div>

          {/* Historical average */}
          {hasHistory && (
            <div style={{ marginBottom: tierData ? 14 : 0 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '4px 0',
              }}>
                <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
                  {pi.histAvgLabel}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  {pctVsHist != null && (
                    <span style={{
                      fontFamily: INTER, fontSize: 10, fontWeight: 600,
                      color: pctVsHist < -0.03 ? G_AMBER : G_GREEN,
                    }}>
                      {pctVsHist >= 0 ? '+' : ''}{Math.round(pctVsHist * 100)}%
                    </span>
                  )}
                  <span style={{
                    fontFamily: MONO, fontSize: 13, fontWeight: 600, color: TEXT,
                    fontFeatureSettings: '"tnum"',
                  }}>
                    {fmtSEK(histAvg)}
                  </span>
                </div>
              </div>
              {histMarginPct != null && (
                <div style={{
                  fontFamily: INTER, fontSize: 11, color: FAINT, paddingBottom: 4,
                }}>
                  {pi.histAvgMargin(histMarginPct)}
                </div>
              )}
            </div>
          )}

          {/* Unlock progress — no history yet */}
          {!hasHistory && insights !== null && !unlocked && (
            <div style={{ marginBottom: 4 }}>
              <div style={{
                fontFamily: INTER, fontSize: 12, color: MUTED,
                marginBottom: 8, lineHeight: 1.55,
              }}>
                {pi.unlockProgress(accCount, threshold)}
              </div>
              <div style={{ height: 3, background: SURF, borderRadius: 2 }}>
                <div style={{
                  width: `${Math.min((accCount / threshold) * 100, 100)}%`,
                  height: '100%', borderRadius: 2, background: ACCENT,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}

          {/* Win rate sentence */}
          {winRate !== null && tierData?.[currentTier]?.n >= 3 && (
            <div style={{
              fontFamily: INTER, fontSize: 12, fontWeight: 500,
              color: winRate >= 0.5 ? G_GREEN : winRate >= 0.3 ? G_AMBER : G_RED,
              background: winRate >= 0.5
                ? 'rgba(22,163,74,0.06)'
                : winRate >= 0.3
                ? 'rgba(181,101,16,0.06)'
                : 'rgba(220,38,38,0.06)',
              borderRadius: 6, padding: '6px 8px',
              marginBottom: tierData ? 12 : 0,
              marginTop: (hasHistory || hasCost) ? 12 : 0,
            }}>
              {pi.winRateLine(Math.round(winRate * 100))}
            </div>
          )}

          {/* Tier acceptance bars */}
          {tierData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                fontFamily: INTER, fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: FAINT, marginBottom: 3,
              }}>
                {pi.acceptanceByTier}
              </div>
              <TierBar label={pi.tierBelow} rate={tierData.below?.acceptance_rate ?? 0} count={tierData.below?.n ?? 0} highlight={bestTier === 'below'} />
              <TierBar label={pi.tierAt}    rate={tierData.at?.acceptance_rate    ?? 0} count={tierData.at?.n    ?? 0} highlight={bestTier === 'at'}    />
              <TierBar label={pi.tierAbove} rate={tierData.above?.acceptance_rate ?? 0} count={tierData.above?.n  ?? 0} highlight={bestTier === 'above'} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function CostRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '3px 0',
    }}>
      <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT, fontFeatureSettings: '"tnum"' }}>
        {value}
      </span>
    </div>
  );
}
