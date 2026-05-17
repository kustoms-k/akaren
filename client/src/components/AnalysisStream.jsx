import { useState } from 'react';
import { S } from '../constants/strings.js';

const INTER   = "'Inter', sans-serif";
const BLUE    = '#4361ee';
const BG      = '#f0f2f5';
const WHITE   = '#ffffff';
const BORDER  = '#e9ecef';
const TEXT    = '#1a1a2e';
const MUTED   = '#6c757d';
const FAINT   = '#9ca3af';
const SURF    = '#f8f9fa';
const WARNING = '#f59e0b';
const ERROR   = '#e74c3c';

const STAGGER = 120; // ms

const FIELDS = [
  { key: 'lasttyp',              label: 'LASTTYP'     },
  { key: 'upphämtning',          label: 'UPPHÄMTNING' },
  { key: 'leverans',             label: 'LEVERANS'    },
  { key: 'datum',                label: 'DATUM'       },
  { key: 'fordon_rekommenderat', label: 'FORDON'      },
  { key: 'avstand_km',           label: 'AVSTÅND',    unit: ' km' },
  { key: 'totalpris_sek',        label: 'TOTALPRIS',  unit: ' kr' },
];

const isMock = (v) => v === '…';

// Small circle-i icon button
function InfoButton({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Why this truck / Varför denna lastbil"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%',
        border: `1px solid ${active ? BLUE : BORDER}`,
        background: active ? 'rgba(67,97,238,0.10)' : 'transparent',
        color: active ? BLUE : MUTED,
        fontFamily: INTER, fontSize: '0.5rem', fontWeight: 700,
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
  const [whyOpen, setWhyOpen] = useState(false);

  if (status === 'idle') {
    return (
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: 16, minHeight: 48, display: 'flex', alignItems: 'center', flexShrink: 0,
      }}>
        <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0, fontStyle: 'italic' }}>
          Väntar på förfrågan…
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

  // Show none-confidence fields even when value is null
  const visibleFields = showFields
    ? FIELDS.filter(({ key }) => {
        const v = parsed[key];
        const c = confidence?.[key];
        return (v != null && v !== '') || c === 'none';
      })
    : [];

  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
    }}>

      {/* Skeleton loading bars */}
      {showSkeleton && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          {[90, 70, 80].map((w, i) => (
            <div
              key={i}
              style={{
                height: 22, borderRadius: 4,
                background: `linear-gradient(90deg, ${BG} 25%, ${BORDER} 50%, ${BG} 75%)`,
                backgroundSize: '800px 100%',
                animation: `skeleton-shimmer 1.4s ease-in-out ${i * 0.18}s infinite`,
                width: `${w}%`,
              }}
            />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {showFields && (
        <div style={{ height: 3, background: BG, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            background: BLUE,
            width: isDone ? '100%' : undefined,
            animation: isStreaming ? 'progress-fill 2s ease-out forwards' : 'none',
            transition: isDone ? 'width 0.3s ease' : 'none',
          }} />
        </div>
      )}

      {/* Field rows */}
      {showFields && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleFields.map(({ key, label, unit }, i) => {
            const val      = parsed[key];
            const mock     = isMock(val);
            const showUnit = unit && !mock && val != null;
            const conf     = confidence?.[key];
            const isNone   = conf === 'none';
            const isLow    = conf === 'low';
            const needsReview = isLow || isNone;

            const isEdited   = needsReview && originalParsed != null
              && String(val) !== String(originalParsed[key]);
            const isApproved = needsReview && (lowApproved?.has(key) ?? false);
            const isResolved = isEdited || isApproved;

            const isLast = i === visibleFields.length - 1;
            const isTruck = key === 'fordon_rekommenderat';
            const hasWhy  = isTruck && isDone && parsed?.fordon_orsak && !isMock(val) && val != null;

            return (
              <div
                key={key}
                style={{
                  opacity: 0,
                  animation: 'field-in 0.3s ease forwards',
                  animationDelay: `${i * STAGGER}ms`,
                  padding: '6px 0 6px 10px',
                  borderBottom: isLast ? 'none' : `1px solid ${BG}`,
                  // Amber left border for fields needing review — functional indicator
                  borderLeft: needsReview && !mock
                    ? `2px solid ${isResolved ? 'rgba(245,158,11,0.3)' : WARNING}`
                    : '2px solid transparent',
                  marginLeft: -10,
                  transition: 'border-color 0.25s',
                }}
              >
                {/* Main row: label + value */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>

                  {/* Label with live route badge */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <span style={{
                      fontFamily: INTER, fontSize: 11, color: MUTED,
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px',
                    }}>
                      {label}
                    </span>
                    {key === 'avstand_km' && routeLoading && !mock && (
                      <span style={{
                        fontFamily: INTER, fontSize: 10,
                        color: FAINT,
                        animation: 'text-pulse 1.2s ease-in-out infinite',
                      }}>
                        ● routing…
                      </span>
                    )}
                    {key === 'avstand_km' && routeLive && !routeLoading && !mock && (
                      <span style={{
                        fontFamily: INTER, fontSize: 10,
                        color: '#16a34a',
                        background: 'rgba(22,163,74,0.08)',
                        border: '1px solid rgba(22,163,74,0.2)',
                        borderRadius: 100,
                        padding: '1px 6px',
                        whiteSpace: 'nowrap',
                      }}>
                        ● Live route
                      </span>
                    )}
                  </span>

                  {/* Value area */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {/* Missing (none) placeholder */}
                    {isNone && !mock && val == null && !onFieldChange && (
                      <span style={{ fontFamily: INTER, fontSize: 12, color: WARNING, fontStyle: 'italic' }}>
                        Missing — needs input
                      </span>
                    )}

                    {/* Editable input — for done state; none fields show empty editable */}
                    {onFieldChange && !mock ? (
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <input
                          value={val == null ? '' : String(val)}
                          placeholder={isNone ? 'Saknas — ange värde / Missing — enter value' : undefined}
                          onChange={(e) => onFieldChange(key, e.target.value)}
                          style={{
                            fontFamily: INTER, fontSize: 14,
                            color: val == null ? WARNING : TEXT,
                            background: WHITE,
                            border: `1.5px solid ${needsReview ? WARNING : BORDER}`,
                            borderRadius: 6,
                            outline: 'none', textAlign: 'right', padding: '2px 6px',
                            minWidth: isNone && val == null ? 120 : 40,
                            maxWidth: 200,
                            width: val == null ? undefined : `${Math.max(String(val).length, 4)}ch`,
                          }}
                        />
                        {showUnit && (
                          <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
                            {unit.trim()}
                          </span>
                        )}
                      </span>
                    ) : val != null && !isNone ? (
                      <span
                        style={{
                          fontFamily: INTER, fontSize: 14, fontWeight: 500, color: TEXT,
                          ...(mock ? {
                            color: FAINT,
                            animation: 'text-pulse 1.2s ease-in-out infinite',
                          } : {}),
                        }}
                      >
                        {String(val)}{showUnit ? unit : ''}
                      </span>
                    ) : null}

                    {/* Why this truck button */}
                    {hasWhy && (
                      <InfoButton
                        active={whyOpen}
                        onClick={() => setWhyOpen((w) => !w)}
                      />
                    )}
                  </span>
                </div>

                {/* Why this truck reveal */}
                {isTruck && whyOpen && parsed?.fordon_orsak && (
                  <div style={{
                    marginTop: 6,
                    fontFamily: INTER, fontSize: 12, color: '#3b82f6',
                    lineHeight: 1.55, padding: '8px 12px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                  }}>
                    {parsed.fordon_orsak}
                  </div>
                )}

                {/* Approval checkbox — low and none fields */}
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
                      style={{ accentColor: BLUE, cursor: 'pointer', width: 12, height: 12, flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
                      {isNone
                        ? 'Fältet kan lämnas tomt / Field may be left blank'
                        : 'Värdet är korrekt / Value is correct'}
                    </span>
                    {isEdited && (
                      <span style={{ fontFamily: INTER, fontSize: 11, color: '#16a34a' }}>
                        ✓ redigerat
                      </span>
                    )}
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quote summary card */}
      {isDone && realPrice != null && (
        <div style={{
          flexShrink: 0, opacity: 0,
          animation: 'quote-card-up 0.2s ease-out forwards',
          animationDelay: '80ms',
          background: SURF, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 11, textTransform: 'uppercase', color: MUTED, fontWeight: 600, letterSpacing: '0.3px' }}>
            OFFERT / QUOTE
          </div>
          <div style={{ fontFamily: INTER, fontSize: 28, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
            {new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(realPrice)}&thinsp;kr
          </div>
          {(parsed.upphämtning || parsed.leverans) && (
            <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT, marginTop: 2 }}>
              {[parsed.upphämtning, parsed.leverans].filter((v) => v && !isMock(v)).join(' → ')}
            </div>
          )}
          <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
            {[
              parsed.lasttyp            && !isMock(parsed.lasttyp)            ? parsed.lasttyp            : null,
              parsed.fordon_rekommenderat && !isMock(parsed.fordon_rekommenderat) ? parsed.fordon_rekommenderat : null,
              parsed.avstand_km         && !isMock(parsed.avstand_km)         ? `${parsed.avstand_km} km`  : null,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <p style={{ fontFamily: INTER, fontSize: 13, color: ERROR, margin: 0 }}>
          {error === 'parse' ? S.errors.parse : S.errors.network}
        </p>
      )}
    </div>
  );
}
