import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER  = "'Inter', sans-serif";
const BLUE   = '#4361ee';
const WHITE  = '#ffffff';
const BORDER = '#e9ecef';
const TEXT   = '#1a1a2e';
const MUTED  = '#6c757d';
const FAINT  = '#9ca3af';
const SURF   = '#f8f9fa';
const BG     = '#f0f2f5';

const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

function TierBar({ label, rate, count, highlight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        fontFamily: INTER, fontSize: 11, color: MUTED,
        width: 86, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 4, background: BG, borderRadius: 2 }}>
        <div style={{
          width: `${Math.round(rate * 100)}%`, height: '100%',
          background: highlight ? BLUE : BORDER,
          borderRadius: 2, transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        fontFamily: INTER, fontSize: 11,
        color: highlight ? BLUE : FAINT,
        width: 28, textAlign: 'right', flexShrink: 0,
      }}>
        {Math.round(rate * 100)}%
      </span>
      <span style={{
        fontFamily: INTER, fontSize: 11, color: FAINT,
        width: 28, flexShrink: 0,
      }}>
        n={count}
      </span>
    </div>
  );
}

export function PricingIntelligencePanel({ lasttyp, currentPrice, onApplyPrice }) {
  const { t } = useLanguage();
  const insights = useLiveQuery(() => db.pricingInsights.toArray(), [], null);

  // Not yet loaded from IndexedDB
  if (insights === null || insights.length === 0) return null;

  const statusInsight = insights.find((i) => i.insight_type === 'status');
  if (!statusInsight) return null;

  const { unlocked, accepted_count, threshold } = statusInsight.insight_data;

  // ── Not yet unlocked: show progress teaser ──────────────────────────────────
  if (!unlocked) {
    const progress = Math.min((accepted_count / threshold) * 100, 100);
    return (
      <div style={{
        flexShrink: 0,
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '16px',
      }}>
        <div style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', color: MUTED, letterSpacing: '0.3px', marginBottom: 8,
        }}>
          {t.pricingIntel.heading}
        </div>
        <div style={{
          fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 10,
        }}>
          {t.pricingIntel.unlockProgress(accepted_count, threshold)}
        </div>
        <div style={{ height: 4, background: BG, borderRadius: 2 }}>
          <div style={{
            width: `${progress}%`, height: '100%', borderRadius: 2,
            background: BLUE,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    );
  }

  // ── Unlocked: find data for this cargo type ─────────────────────────────────
  const cargoInsight = insights.find((i) => i.insight_type === 'cargo_type_margin');
  const tierInsight  = insights.find((i) => i.insight_type === 'price_tier_acceptance');
  if (!cargoInsight) return null;

  const cargoItem = cargoInsight.insight_data.items?.find((i) => i.lasttyp === lasttyp);
  if (!cargoItem || cargoItem.n < 3) {
    return (
      <div style={{
        flexShrink: 0,
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '16px',
      }}>
        <div style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', color: MUTED, letterSpacing: '0.3px', marginBottom: 6,
        }}>
          {t.pricingIntel.heading}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          {t.pricingIntel.notEnoughData(lasttyp, cargoItem?.n ?? 0)}
        </div>
      </div>
    );
  }

  const avgPrice  = cargoItem.avg_price;
  const pctDiff   = (currentPrice - avgPrice) / avgPrice;
  const isBelow   = pctDiff < -0.03;
  const isAbove   = pctDiff > 0.03;

  // Recommended price — derived from tier acceptance data
  const tierData = tierInsight?.insight_data?.by_cargo_type?.[lasttyp];
  let recommendedPrice = Math.round(avgPrice * 1.05 / 100) * 100;
  if (tierData) {
    const aboveRate = tierData.above?.acceptance_rate ?? 0;
    const atRate    = tierData.at?.acceptance_rate    ?? 0;
    if (aboveRate >= 0.5)      recommendedPrice = Math.round(avgPrice * 1.10 / 100) * 100;
    else if (atRate >= 0.5)    recommendedPrice = Math.round(avgPrice * 1.05 / 100) * 100;
    else                       recommendedPrice = Math.round(avgPrice           / 100) * 100;
  }

  const absPct = Math.abs(Math.round(pctDiff * 100));
  const priceDiffColor = isBelow ? '#e74c3c' : isAbove ? '#16a34a' : MUTED;
  const priceDiffLabel = isBelow
    ? t.pricingIntel.belowAvg(absPct)
    : isAbove
    ? t.pricingIntel.aboveAvg(absPct)
    : t.pricingIntel.atAvg;

  // Highlight whichever tier has the best acceptance rate
  const bestTier = tierData
    ? ['below', 'at', 'above'].reduce(
        (best, k) => (tierData[k]?.acceptance_rate ?? 0) > (tierData[best]?.acceptance_rate ?? 0) ? k : best,
        'at',
      )
    : null;

  const confidenceColor = cargoItem.n >= 20 ? '#16a34a' : cargoItem.n >= 8 ? '#d97706' : '#e74c3c';
  const confidenceLabel = cargoItem.n >= 20
    ? t.pricingIntel.confidence.high
    : cargoItem.n >= 8
    ? t.pricingIntel.confidence.medium
    : t.pricingIntel.confidence.low;

  return (
    <div style={{
      flexShrink: 0,
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          fontFamily: INTER, fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', color: MUTED, letterSpacing: '0.3px',
        }}>
          {t.pricingIntel.heading}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: INTER, fontSize: 11, color: FAINT }}>
            {t.pricingIntel.nJobs(cargoItem.n, lasttyp)} · {t.pricingIntel.confidence.label}:
          </span>
          <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: confidenceColor }}>
            {confidenceLabel}
          </span>
        </div>
      </div>

      {/* Price comparison rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
            {t.pricingIntel.yourAvg}
          </span>
          <span style={{ fontFamily: INTER, fontSize: 16, fontWeight: 600, color: TEXT }}>
            {fmtSEK(avgPrice)}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
            {t.pricingIntel.thisQuote}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: INTER, fontSize: 11, color: priceDiffColor }}>
              {priceDiffLabel}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: priceDiffColor }}>
              {fmtSEK(currentPrice)}
            </span>
          </div>
        </div>

        <div style={{ height: 1, background: BORDER, margin: '2px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: INTER, fontSize: 12, color: BLUE, fontWeight: 500 }}>
            {t.pricingIntel.recommended}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: INTER, fontSize: 18, fontWeight: 700, color: BLUE }}>
              {fmtSEK(recommendedPrice)}
            </span>
            <button
              onClick={() => onApplyPrice(recommendedPrice)}
              style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 500,
                background: 'rgba(67,97,238,0.10)', color: BLUE,
                border: '1px solid rgba(67,97,238,0.25)', borderRadius: 6,
                padding: '4px 10px', cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(67,97,238,0.20)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(67,97,238,0.10)'; }}
            >
              {t.pricingIntel.apply}
            </button>
          </div>
        </div>
      </div>

      {/* Tier acceptance bars */}
      {tierData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{
            fontFamily: INTER, fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', color: MUTED, letterSpacing: '0.3px', marginBottom: 4,
          }}>
            {t.pricingIntel.acceptanceByTier}
          </div>
          <TierBar
            label={t.pricingIntel.tierBelow}
            rate={tierData.below?.acceptance_rate ?? 0}
            count={tierData.below?.n ?? 0}
            highlight={bestTier === 'below'}
          />
          <TierBar
            label={t.pricingIntel.tierAt}
            rate={tierData.at?.acceptance_rate ?? 0}
            count={tierData.at?.n ?? 0}
            highlight={bestTier === 'at'}
          />
          <TierBar
            label={t.pricingIntel.tierAbove}
            rate={tierData.above?.acceptance_rate ?? 0}
            count={tierData.above?.n ?? 0}
            highlight={bestTier === 'above'}
          />
        </div>
      )}
    </div>
  );
}
