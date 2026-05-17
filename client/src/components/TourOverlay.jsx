import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useAuth }  from '../context/AuthContext.jsx';

const BLUE  = '#4361ee';
const WHITE = '#ffffff';
const TEXT  = '#1a1a2e';
const MUTED = '#6c757d';
const INTER = "'Inter', sans-serif";

const TOUR_STEPS = [
  {
    navId: 'new-quote',
    title: 'AI Quote Builder',
    titleSv: 'AI-offertverktyg',
    desc: 'Paste any Swedish transport inquiry — the AI extracts all details and builds a fully priced, confidence-scored quote in seconds.',
    descSv: 'Klistra in valfri förfrågan — AI:n extraherar alla detaljer och skapar en komplett offert på sekunder.',
    emoji: '⚡',
  },
  {
    navId: 'customers',
    title: 'Customer Portals',
    titleSv: 'Kundportaler',
    desc: 'Every customer gets a unique private link to view their quotes, invoices, and message you directly.',
    descSv: 'Varje kund får en unik privat länk för att se offerter, fakturor och skicka meddelanden.',
    emoji: '🔗',
  },
  {
    navId: 'lonsamhet',
    title: 'Profitability',
    titleSv: 'Lönsamhet',
    desc: 'Track revenue and margin per route, vehicle, and time period. Know exactly where you make money.',
    descSv: 'Följ intäkt och marginal per rutt, fordon och tidsperiod. Vet exakt var du tjänar pengar.',
    emoji: '📈',
  },
  {
    navId: 'jobs',
    title: 'Jobs & Invoices',
    titleSv: 'Uppdrag & Fakturor',
    desc: 'Convert accepted quotes to jobs, assign drivers, and generate invoices — with optional Fortnox sync.',
    descSv: 'Omvandla accepterade offerter till uppdrag, tilldela förare och generera fakturor — med Fortnox-synk.',
    emoji: '📋',
  },
];

const STORAGE_KEY = (userId) => `tour_dismissed_${userId}`;

export function TourOverlay() {
  const { user } = useAuth();
  const [step,    setStep]    = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect,    setRect]    = useState(null);
  const [side,    setSide]    = useState('right'); // tooltip side
  const tooltipRef = useRef(null);

  // Check if tour was already dismissed for this user
  useEffect(() => {
    if (!user?.id) return;
    const dismissed = localStorage.getItem(STORAGE_KEY(user.id));
    if (!dismissed) setVisible(true);
  }, [user?.id]);

  // Measure target nav item position whenever step changes
  useLayoutEffect(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    if (!current) return;

    function measure() {
      const el = document.querySelector(`[data-nav-id="${current.navId}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect(r);
      // Tooltip goes right unless too close to edge
      setSide(r.right + 320 < window.innerWidth ? 'right' : 'bottom');
    }

    measure();
    // Re-measure on resize
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step, visible]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    if (user?.id) localStorage.setItem(STORAGE_KEY(user.id), '1');
    // Best-effort server record
    try { await apiFetch('/api/onboarding/dismiss-tour', { method: 'POST' }); } catch { /* ignore */ }
  }, [user?.id]);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) { dismiss(); return; }
    setStep((s) => s + 1);
  }, [step, dismiss]);

  if (!visible || !rect) return null;

  const current = TOUR_STEPS[step];
  const PAD = 6; // highlight padding

  // Tooltip position
  const tooltipStyle = side === 'right'
    ? {
        position: 'fixed',
        top:  Math.max(8, rect.top + rect.height / 2 - 100),
        left: rect.right + 14,
      }
    : {
        position: 'fixed',
        top:  rect.bottom + 10,
        left: Math.max(8, rect.left),
      };

  return (
    <>
      {/* Dark overlay with punch-through cutout via clip-path workaround */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0)', // transparent click-to-dismiss layer
          cursor: 'default',
        }}
      />

      {/* Dimming panels — four rectangles around the highlighted element */}
      {[
        // top
        { top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) },
        // bottom
        { top: rect.bottom + PAD, left: 0, right: 0, bottom: 0 },
        // left
        { top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 },
        // right
        { top: rect.top - PAD, left: rect.right + PAD, right: 0, height: rect.height + PAD * 2 },
      ].map((s, i) => (
        <div key={i} style={{
          position: 'fixed', zIndex: 1001,
          background: 'rgba(10,10,20,0.62)',
          pointerEvents: 'none',
          ...s,
        }} />
      ))}

      {/* Highlight ring around nav item */}
      <div style={{
        position: 'fixed', zIndex: 1002, pointerEvents: 'none',
        top:    rect.top    - PAD,
        left:   rect.left   - PAD,
        width:  rect.width  + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: 10,
        boxShadow: `0 0 0 3px ${BLUE}, 0 0 0 6px rgba(67,97,238,0.25)`,
        animation: 'tourPulse 1.8s ease-in-out infinite',
      }} />

      <style>{`
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 3px ${BLUE}, 0 0 0 6px rgba(67,97,238,0.25); }
          50%       { box-shadow: 0 0 0 3px ${BLUE}, 0 0 0 10px rgba(67,97,238,0.10); }
        }
      `}</style>

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        style={{
          ...tooltipStyle,
          zIndex: 1003,
          width: 300,
          background: WHITE, borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          fontFamily: INTER,
        }}
      >
        {/* Header */}
        <div style={{
          background: BLUE, padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{current.emoji}</span>
            <div>
              <div style={{ color: WHITE, fontWeight: 700, fontSize: 14 }}>{current.title}</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>{current.titleSv}</div>
            </div>
          </div>
          <button
            onClick={dismiss}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
              color: WHITE, borderRadius: 6, padding: '4px 8px',
              fontFamily: INTER, fontSize: 12, fontWeight: 500,
            }}
          >
            Skip / Hoppa
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 13, color: TEXT, margin: '0 0 6px', lineHeight: 1.6 }}>{current.desc}</p>
          <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.6 }}>{current.descSv}</p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 5 }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 16 : 6, height: 6, borderRadius: 3,
                background: i === step ? BLUE : '#d1d5db',
                transition: 'width 0.2s, background 0.2s',
              }} />
            ))}
          </div>

          <button
            onClick={next}
            style={{
              fontFamily: INTER, fontWeight: 600, fontSize: 13,
              background: BLUE, color: WHITE, border: 'none', cursor: 'pointer',
              borderRadius: 7, padding: '7px 18px',
            }}
          >
            {step < TOUR_STEPS.length - 1 ? 'Next / Nästa →' : 'Done / Klar ✓'}
          </button>
        </div>
      </div>
    </>
  );
}
