import { S } from '../constants/strings.js';

const INTER = "'Inter', sans-serif";
const BLUE  = '#4361ee';

const fmtPrice = (n) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <circle cx="7.5" cy="7.5" r="6.3" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7.5 4.5V7.5L9.8 9.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Header({ onHistoryOpen, fleetCount, fuelPrice }) {
  const isLive     = fuelPrice && fuelPrice.source !== 'fallback';
  const dotColor   = isLive ? 'var(--accent-green)' : 'var(--text-secondary)';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background:   'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Brand */}
        <div className="flex items-baseline gap-2.5">
          <span
            style={{
              fontFamily:    INTER,
              fontSize:      '1.375rem',
              color:         'var(--text-primary)',
              letterSpacing: '0.02em',
            }}
          >
            {S.header.brand}
          </span>
          <span
            style={{
              fontFamily:    INTER,
              fontSize:      '0.6875rem',
              fontWeight:    500,
              color:         BLUE,
              letterSpacing: '0.12em',
            }}
          >
            {S.header.product}
          </span>
        </div>

        {/* Right: company · fleet · fuel price · status dot · history */}
        <div className="flex items-center gap-3 sm:gap-4">
          <span
            className="hide-mobile"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize:   '0.8125rem',
              fontWeight: 500,
              color:      'var(--text-secondary)',
            }}
          >
            {S.app.company}
          </span>

          {fleetCount > 0 && (
            <span
              className="hide-mobile"
              style={{
                fontFamily:   MONO,
                fontSize:     '0.6875rem',
                color:        'var(--text-secondary)',
                letterSpacing:'0.06em',
                borderLeft:   '1px solid var(--border)',
                paddingLeft:  12,
              }}
            >
              {fleetCount} fordon aktiva
            </span>
          )}

          {/* Diesel price widget */}
          {fuelPrice && (
            <span
              className="hide-mobile"
              title={isLive ? `Källa: ${fuelPrice.source}` : 'Standardpris (live-hämtning misslyckades)'}
              style={{
                fontFamily:    INTER,
                fontSize:      '0.6875rem',
                color:         'var(--text-secondary)',
                letterSpacing: '0.04em',
                borderLeft:    '1px solid var(--border)',
                paddingLeft:   12,
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}
            >
              Dieselpris idag: {fmtPrice(fuelPrice.price_per_litre)} kr/L
              <span
                style={{
                  display:      'inline-block',
                  width:        6,
                  height:       6,
                  borderRadius: '50%',
                  background:   dotColor,
                  flexShrink:   0,
                }}
              />
            </span>
          )}

          {/* System live dot */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ background: 'var(--accent-green)' }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: 'var(--accent-green)' }}
              />
            </span>
            <span
              style={{
                fontFamily:    INTER,
                fontSize:      '0.6875rem',
                color:         'var(--accent-green)',
                letterSpacing: '0.08em',
              }}
            >
              {S.header.statusLabel}
            </span>
          </div>

          {/* History button */}
          <button
            className="icon-btn"
            onClick={onHistoryOpen}
            aria-label={S.header.historyAriaLabel}
          >
            <HistoryIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
