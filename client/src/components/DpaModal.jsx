import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER  = "'Geist', system-ui, sans-serif";
const BLUE   = '#4361ee';
const BLUE_DK = '#3451d1';
const WHITE  = '#ffffff';
const BORDER = '#e9ecef';
const TEXT   = '#1a1a2e';
const MUTED  = '#6c757d';
const SURF   = '#f8f9fa';

export function DpaModal({ onAccepted }) {
  const { t } = useLanguage();
  const [dpa,       setDpa]       = useState(null);
  const [scrolled,  setScrolled]  = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error,     setError]     = useState(null);
  const textRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/data-privacy/dpa')
      .then((r) => r.json())
      .then(setDpa)
      .catch(() => setError(t.dpa.loadError));
  }, []);

  function handleScroll() {
    const el = textRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.9) {
      setScrolled(true);
    }
  }

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/data-privacy/dpa/accept', { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onAccepted(data.dpa_accepted_at ?? new Date().toISOString());
    } catch {
      setError(t.dpa.acceptError);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
        width: '100%',
        maxWidth: 680,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px 16px',
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          background: SURF,
        }}>
          <div style={{
            fontFamily: INTER, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: BLUE, marginBottom: 6,
          }}>
            {t.dpa.heading}
          </div>
        </div>

        {/* DPA text — scrollable */}
        <div
          ref={textRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 28px',
            fontFamily: 'monospace',
            fontSize: 12,
            color: MUTED,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            background: SURF,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {dpa ? dpa.text : (
            <div style={{ color: MUTED, fontStyle: 'italic', fontFamily: INTER }}>
              {t.dpa.loading}
            </div>
          )}
        </div>

        {/* Scroll hint */}
        {!scrolled && dpa && (
          <div style={{
            padding: '6px 28px',
            background: SURF,
            borderTop: `1px solid ${BORDER}`,
            fontFamily: INTER, fontSize: 12,
            color: MUTED,
            flexShrink: 0,
          }}>
            {t.dpa.scrollHint}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 28px 20px',
          borderTop: `1px solid ${BORDER}`,
          display: 'flex', flexDirection: 'column', gap: 10,
          flexShrink: 0,
          background: WHITE,
        }}>
          {error && (
            <div style={{
              fontFamily: INTER, fontSize: 13, color: '#e74c3c',
              padding: '8px 12px',
              background: 'rgba(231,76,60,0.06)',
              border: '1px solid rgba(231,76,60,0.2)',
              borderRadius: 6,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, fontFamily: INTER, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
              {dpa ? `Version ${dpa.version}` : ''} · {t.dpa.footer}
            </div>
            <button
              onClick={handleAccept}
              disabled={!scrolled || accepting || !dpa}
              title={!scrolled ? t.dpa.scrollHint : undefined}
              style={{
                fontFamily: INTER,
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 24px',
                background: scrolled && dpa ? BLUE : SURF,
                color: scrolled && dpa ? WHITE : MUTED,
                border: 'none',
                borderRadius: 6,
                cursor: scrolled && dpa ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s, color 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (scrolled && dpa) e.currentTarget.style.background = BLUE_DK; }}
              onMouseLeave={(e) => { if (scrolled && dpa) e.currentTarget.style.background = BLUE; }}
            >
              {accepting ? t.dpa.accepting : t.dpa.accept}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
