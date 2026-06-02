import { useState } from 'react';
import { motion } from 'motion/react';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER   = '#2d3340';
const BG      = '#f4f5f7';
const WHITE   = '#ffffff';
const BORDER  = '#ececef';
const TEXT    = '#1a1d24';
const MUTED   = '#6b7280';
const FAINT   = '#9ca3af';
const SURF    = '#f4f5f7';
const OUTFIT  = "'Geist', system-ui, sans-serif";

const WARNING = '#b56510';
const ERROR   = '#dc2626';

const STAGGER = 110;

function getFields(t) {
  return [
    { key: 'lasttyp',              label: t.newQuote.fields.lasttyp              },
    { key: 'upphämtning',          label: t.newQuote.fields.upphämtning          },
    { key: 'leverans',             label: t.newQuote.fields.leverans             },
    { key: 'datum',                label: t.newQuote.fields.datum                },
    { key: 'fordon_rekommenderat', label: t.newQuote.fields.fordon_rekommenderat },
    { key: 'avstand_km',           label: t.newQuote.fields.avstand_km,    unit: ' km', mono: true },
    { key: 'totalpris_sek',        label: t.newQuote.fields.totalpris_sek, unit: ' kr', mono: true },
  ];
}

const isMock = (v) => v === '…';

function InfoButton({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Why this truck"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%',
        border: `1px solid ${active ? AMBER : BORDER}`,
        background: active ? 'rgba(45,51,64,0.10)' : 'transparent',
        color: active ? AMBER : MUTED,
        fontFamily: OUTFIT, fontSize: '0.5rem', fontWeight: 700,
        cursor: 'pointer', flexShrink: 0,
        lineHeight: 1, padding: 0,
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
      }}
    >
      i
    </button>
  );
}

export function AnalysisStream({
  status, rawText, parsed, error,
  confidence, originalParsed,
  lowApproved, onApprove,
  onFieldChange,
  routeLive = false,
  routeLoading = false,
}) {
  const { t } = useLanguage();
  const [whyOpen, setWhyOpen] = useState(false);

  if (status === 'idle') {
    return (
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: '14px 16px', minHeight: 48,
        display: 'flex', alignItems: 'center', flexShrink: 0,
      }}>
        <p style={{ fontFamily: OUTFIT, fontSize: 13, color: FAINT, margin: 0, fontStyle: 'italic' }}>
          {t.newQuote.analysis.idle}
        </p>
      </div>
    );
  }

  const isStreaming  = status === 'streaming';
  const isDone       = status === 'done';
  const showSkeleton = isStreaming && !rawText;
  const showFields   = (isStreaming || isDone) && parsed && !showSkeleton;

  const realPrice = isDone && parsed && !isMock(parsed.totalpris_sek)
    ? Number(parsed.totalpris_sek)
    : null;

  const visibleFields = showFields
    ? getFields(t).filter(({ key }) => {
        const v = parsed[key];
        const c = confidence?.[key];
        return (v != null && v !== '') || c === 'none';
      })
    : [];

  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
    }}>

      {/* Skeleton */}
      {showSkeleton && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          {[85, 65, 75].map((w, i) => (
            <div key={i} style={{
              height: 20, borderRadius: 4,
              background: `linear-gradient(90deg, ${BG} 25%, ${BORDER} 50%, ${BG} 75%)`,
              backgroundSize: '800px 100%',
              animation: `skeleton-shimmer 1.4s ease-in-out ${i * 0.18}s infinite`,
              width: `${w}%`,
            }} />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {showFields && (
        <div style={{ height: 2, background: BG, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            background: AMBER,
            width: isDone ? '100%' : undefined,
            animation: isStreaming ? 'progress-fill 2s ease-out forwards' : 'none',
            transition: isDone ? 'width 0.3s ease' : 'none',
          }} />
        </div>
      )}

      {/* Fields */}
      {showFields && (
        <motion.div
          style={{ display: 'flex', flexDirection: 'column' }}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.055 } } }}
        >
          {visibleFields.map(({ key, label, unit, mono }, i) => {
            const val         = parsed[key];
            const mock        = isMock(val);
            const showUnit    = unit && !mock && val != null;
            const conf        = confidence?.[key];
            const isNone      = conf === 'none';
            const isLow       = conf === 'low';
            const needsReview = isLow || isNone;

            const isEdited   = needsReview && originalParsed != null
              && String(val) !== String(originalParsed[key]);
            const isApproved = needsReview && (lowApproved?.has(key) ?? false);
            const isResolved = isEdited || isApproved;

            const isLast  = i === visibleFields.length - 1;
            const isTruck = key === 'fordon_rekommenderat';
            const hasWhy  = isTruck && isDone && parsed?.fordon_orsak && !isMock(val) && val != null;

            return (
              <motion.div
                key={key}
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
                }}
                style={{
                  padding: '6px 0 6px 10px',
                  borderBottom: isLast ? 'none' : `1px solid ${BG}`,
                  borderLeft: needsReview && !mock
                    ? `2px solid ${isResolved ? 'rgba(184,96,10,0.25)' : WARNING}`
                    : '2px solid transparent',
                  marginLeft: -10,
                  transition: 'border-color 0.25s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
                  {/* Label */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <span style={{
                      fontFamily: OUTFIT, fontSize: 11, color: MUTED,
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {label}
                    </span>
                    {key === 'avstand_km' && routeLoading && !mock && (
                      <span style={{ fontFamily: OUTFIT, fontSize: 10, color: FAINT, animation: 'text-pulse 1.2s ease-in-out infinite' }}>
                        {t.newQuote.analysis.routeCalc}
                      </span>
                    )}
                    {key === 'avstand_km' && routeLive && !routeLoading && !mock && (
                      <span style={{
                        fontFamily: OUTFIT, fontSize: 10,
                        color: '#1d6b45',
                        background: 'rgba(29,107,69,0.08)',
                        border: '1px solid rgba(29,107,69,0.2)',
                        borderRadius: 100,
                        padding: '1px 6px',
                        whiteSpace: 'nowrap',
                      }}>
                        ● {t.newQuote.analysis.routeLive}
                      </span>
                    )}
                  </span>

                  {/* Value */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isNone && !mock && val == null && !onFieldChange && (
                      <span style={{ fontFamily: OUTFIT, fontSize: 12, color: WARNING, fontStyle: 'italic' }}>
                        {t.newQuote.analysis.idle}
                      </span>
                    )}

                    {onFieldChange && !mock ? (
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <input
                          value={val == null ? '' : String(val)}
                          placeholder={isNone ? t.newQuote.analysis.idle : undefined}
                          onChange={(e) => onFieldChange(key, e.target.value)}
                          style={{
                            fontFamily: mono ? INTER : OUTFIT, fontSize: 14,
                            color: val == null ? WARNING : TEXT,
                            background: WHITE,
                            border: `1.5px solid ${needsReview ? WARNING : BORDER}`,
                            borderRadius: 5,
                            outline: 'none', textAlign: 'right', padding: '2px 6px',
                            minWidth: isNone && val == null ? 120 : 40,
                            maxWidth: 200,
                            width: val == null ? undefined : `${Math.max(String(val).length, 4)}ch`,
                          }}
                        />
                        {showUnit && (
                          <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                            {unit.trim()}
                          </span>
                        )}
                      </span>
                    ) : val != null && !isNone ? (
                      <span style={{
                        fontFamily: mono ? INTER : OUTFIT,
                        fontFeatureSettings: mono ? '"tnum"' : undefined,
                        fontSize: 14, fontWeight: mono ? 500 : 500, color: TEXT,
                        ...(mock ? { color: FAINT, animation: 'text-pulse 1.2s ease-in-out infinite' } : {}),
                      }}>
                        {String(val)}{showUnit ? unit : ''}
                      </span>
                    ) : null}

                    {hasWhy && (
                      <InfoButton active={whyOpen} onClick={() => setWhyOpen((w) => !w)} />
                    )}
                  </span>
                </div>

                {/* Why this truck */}
                {isTruck && whyOpen && parsed?.fordon_orsak && (
                  <div style={{
                    marginTop: 6,
                    fontFamily: OUTFIT, fontSize: 12, color: '#1e4d35',
                    lineHeight: 1.55, padding: '8px 12px',
                    background: 'rgba(29,107,69,0.06)',
                    border: '1px solid rgba(29,107,69,0.15)',
                    borderRadius: 7,
                  }}>
                    {parsed.fordon_orsak}
                  </div>
                )}

                {/* Approval checkbox */}
                {needsReview && !mock && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 5, paddingLeft: 2, cursor: 'pointer',
                    opacity: isResolved ? 0.45 : 1,
                    transition: 'opacity 0.15s',
                  }}>
                    <input
                      type="checkbox"
                      checked={isApproved}
                      onChange={(e) => onApprove?.(key, e.target.checked)}
                      style={{ accentColor: '#2d3340', cursor: 'pointer', width: 12, height: 12, flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                      {isNone ? t.newQuote.flags.confirmFields : t.newQuote.flags.reviewAcknowledged}
                    </span>
                    {isEdited && (
                      <span style={{ fontFamily: OUTFIT, fontSize: 11, color: '#1d6b45' }}>
                        {t.newQuote.flags.reviewAcknowledged}
                      </span>
                    )}
                  </label>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Price readout — instrument panel style */}
      {isDone && realPrice != null && (
        <div style={{
          flexShrink: 0, opacity: 0,
          animation: 'quote-card-up 0.22s ease-out forwards',
          animationDelay: '80ms',
          background: '#1a1d24',
          border: `1px solid #2d3340`,
          borderRadius: 10,
          padding: '16px 18px',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{
              fontFamily: OUTFIT, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              color: 'rgba(156,163,175,0.8)',
              marginBottom: 6,
            }}>
              {t.newQuote.quotePrefix}
            </div>
            <div style={{
              fontFamily: INTER, fontFeatureSettings: '"tnum"',
              fontFeatureSettings: '"tnum"',
              fontSize: 30,
              fontWeight: 500,
              color: AMBER,
              lineHeight: 1,
              letterSpacing: '-0.01em',
            }}>
              {new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(realPrice)}
              <span style={{ fontSize: 16, marginLeft: 4, opacity: 0.7 }}>kr</span>
            </div>
            {(parsed.upphämtning || parsed.leverans) && (
              <div style={{
                fontFamily: OUTFIT, fontSize: 12,
                color: 'rgba(156,163,175,0.6)',
                marginTop: 7,
              }}>
                {[parsed.upphämtning, parsed.leverans].filter((v) => v && !isMock(v)).join(' – ')}
              </div>
            )}
          </div>

          {/* Right: meta tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
            {[
              parsed.lasttyp             && !isMock(parsed.lasttyp)             ? parsed.lasttyp            : null,
              parsed.avstand_km          && !isMock(parsed.avstand_km)          ? `${parsed.avstand_km} km` : null,
            ].filter(Boolean).map((tag) => (
              <span key={tag} style={{
                fontFamily: OUTFIT, fontSize: 10, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'rgba(156,163,175,0.7)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                padding: '3px 8px',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && error !== 'subscription_required' && (
        <p style={{ fontFamily: OUTFIT, fontSize: 13, color: ERROR, margin: 0 }}>
          {error === 'parse' ? t.errors.parse : t.errors.network}
        </p>
      )}
    </div>
  );
}
