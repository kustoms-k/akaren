import { useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER  = '#B56510';
const OUTFIT = "'Geist', system-ui, sans-serif";
const INTER  = OUTFIT;


export function SubscriptionGate({ onClose }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/stripe/checkout', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(13,13,15,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fade-in 160ms cubic-bezier(0.23,1,0.32,1) both',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{
        background: '#0d0d0f',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 14,
        width: '100%', maxWidth: 480,
        overflow: 'hidden',
        animation: 'card-up 0.25s cubic-bezier(0.22,1,0.36,1) both',
        boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
      }}>

        {/* Header */}
        <div style={{ padding: '28px 28px 0' }}>
          <div style={{
            fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 10, letterSpacing: '0.14em',
            color: 'rgba(181,101,16,0.6)', textTransform: 'uppercase', marginBottom: 10,
          }}>
            {t.subscriptionGate.brand}
          </div>
          <div style={{
            fontFamily: OUTFIT, fontSize: 22, fontWeight: 800,
            color: '#ffffff', lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 8,
          }}>
            {t.subscriptionGate.heading}
          </div>
          <div style={{
            fontFamily: OUTFIT, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 24,
          }}>
            {t.subscriptionGate.desc}
          </div>
        </div>

        {/* Price */}
        <div style={{ padding: '0 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 36, fontWeight: 500, color: AMBER, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {t.subscriptionGate.price}
            </span>
            <span style={{ fontFamily: OUTFIT, fontSize: 14, color: 'rgba(181,101,16,0.6)' }}>
              {t.subscriptionGate.currency}
            </span>
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
            {t.subscriptionGate.disclaimer}
          </div>
        </div>

        {/* Feature list */}
        <div style={{ padding: '18px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{
            fontFamily: OUTFIT, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.28)', marginBottom: 12,
          }}>
            {t.subscriptionGate.included}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {t.subscriptionGate.features.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(181,101,16,0.12)',
                  border: '1px solid rgba(181,101,16,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: AMBER,
                }}>
                  +
                </span>
                <span style={{ fontFamily: OUTFIT, fontSize: 13, color: 'rgba(255,255,255,0.70)' }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: '20px 28px 26px' }}>
          {error && (
            <div style={{
              fontFamily: OUTFIT, fontSize: 12, color: '#f87171',
              marginBottom: 12, background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7, padding: '8px 12px',
            }}>
              {error}
            </div>
          )}
          <button
            onClick={handleSubscribe}
            disabled={loading}
            style={{
              width: '100%', padding: '13px 20px',
              background: AMBER, color: '#17161a',
              fontFamily: OUTFIT, fontSize: 14, fontWeight: 700,
              letterSpacing: '0.03em',
              border: 'none', borderRadius: 9, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.65 : 1,
              transition: 'opacity 160ms, transform 160ms',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#e4a830'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = AMBER; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading ? t.subscriptionGate.subscribing : t.subscriptionGate.subscribe}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                width: '100%', marginTop: 10, padding: '9px',
                background: 'transparent', color: 'rgba(255,255,255,0.35)',
                fontFamily: OUTFIT, fontSize: 12,
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9,
                cursor: 'pointer', transition: 'color 160ms, border-color 160ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              {t.subscriptionGate.skip}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
