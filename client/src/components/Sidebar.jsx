import { useState, useEffect } from 'react';
import { S } from '../constants/strings.js';

const INTER = "'Inter', sans-serif";
const BLUE  = '#4361ee';

const fmtSEK = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtDate = (str) => {
  if (!str) return '—';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date(str.replace(' ', 'T')));
  } catch {
    return str;
  }
};

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M1 1L12 12M12 1L1 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Sidebar({ open, onClose }) {
  const [quotes,  setQuotes]  = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/quotes')
      .then((r) => r.json())
      .then((data) => setQuotes(Array.isArray(data) ? data.slice(0, 10) : []))
      .catch(() => setQuotes([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          zIndex: 80,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className="sidebar-panel"
        aria-label={S.sidebar.heading}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 90,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: 56,
            padding: '0 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: INTER,
              fontSize: '0.625rem',
              letterSpacing: '0.14em',
              color: 'var(--text-secondary)',
            }}
          >
            {S.sidebar.heading}
          </span>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={S.sidebar.closeAriaLabel}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Quote list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <p
              style={{
                fontFamily: INTER,
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                padding: '20px',
                margin: 0,
              }}
            >
              {S.sidebar.loading}
            </p>
          )}

          {!loading && quotes.length === 0 && (
            <p
              style={{
                fontFamily: INTER,
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                padding: '20px',
                margin: 0,
              }}
            >
              {S.sidebar.empty}
            </p>
          )}

          {quotes.map((q) => (
            <div
              key={q.id}
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {/* Row 1: lasttyp + total */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 5,
                }}
              >
                <span
                  style={{
                    fontFamily: INTER,
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {q.lasttyp ?? '—'}
                </span>
                <span
                  style={{
                    fontFamily: INTER,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: BLUE,
                    flexShrink: 0,
                  }}
                >
                  {fmtSEK(q.totalpris_sek)}
                </span>
              </div>

              {/* Row 2: quote id + date */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: INTER,
                    fontSize: '0.625rem',
                    letterSpacing: '0.08em',
                    color: BLUE,
                    opacity: 0.8,
                  }}
                >
                  {q.id}
                </span>
                <span
                  style={{
                    fontFamily: INTER,
                    fontSize: '0.6875rem',
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {fmtDate(q.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
