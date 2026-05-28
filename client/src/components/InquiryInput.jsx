import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER  = '#c9921e';
const BG     = '#edeae1';
const WHITE  = '#ffffff';
const BORDER = '#cfc9bb';
const TEXT   = '#151210';
const MUTED  = '#6a6050';
const OUTFIT = "'Plus Jakarta Sans', system-ui, sans-serif";
const MONO   = "'Plus Jakarta Sans', system-ui, sans-serif";

const MAX_LEN = 4000;

export function InquiryInput({ onAnalyse, loading, apiError, isOnline = true }) {
  const { t, lang } = useLanguage();
  const [text,    setText]    = useState('');
  const [focused, setFocused] = useState(false);

  const charCount = text.length;
  const nearLimit = charCount > MAX_LEN * 0.85;
  const empty     = !text.trim();
  const disabled  = loading || empty || !isOnline;

  function handleSubmit(e) {
    e.preventDefault();
    if (!disabled) onAnalyse(text.trim(), lang);
  }

  const errorMsg =
    apiError === 'parse'   ? t.errors.parse  :
    apiError === 'network' ? t.errors.network :
    null;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{
          fontFamily: OUTFIT, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED,
        }}>
          {t.inquiry.label ?? 'Transportförfrågan'}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 10,
          color: nearLimit ? '#c45454' : MUTED,
          letterSpacing: '0.04em',
          transition: 'color 0.2s',
        }}>
          {charCount.toLocaleString('sv-SE')}/{MAX_LEN.toLocaleString('sv-SE')}
        </span>
      </div>

      {/* Textarea */}
      <div style={{
        borderRadius: 8,
        border: `1.5px solid ${focused ? AMBER : BORDER}`,
        boxShadow: focused ? '0 0 0 3px rgba(201,146,30,0.11)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        background: WHITE,
        overflow: 'hidden',
      }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          placeholder={t.inquiry.placeholder}
          disabled={loading}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            fontFamily: OUTFIT,
            fontSize: 14,
            lineHeight: 1.7,
            color: TEXT,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            height: 148,
            padding: '13px 15px',
            resize: 'none',
            width: '100%',
            boxSizing: 'border-box',
            opacity: loading ? 0.55 : 1,
            transition: 'opacity 0.2s',
          }}
        />
      </div>

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Inline error / offline status */}
        {!isOnline && (
          <span style={{ fontFamily: OUTFIT, fontSize: 12, color: '#c45454', flex: 1, lineHeight: 1.4 }}>
            {t.inquiry.offline}
          </span>
        )}
        {errorMsg && isOnline && (
          <span style={{ fontFamily: OUTFIT, fontSize: 12, color: '#c45454', flex: 1, lineHeight: 1.4 }}>
            {errorMsg}
          </span>
        )}
        {!errorMsg && isOnline && <div style={{ flex: 1 }} />}

        {/* Submit */}
        <button
          type="submit"
          disabled={disabled}
          style={{
            fontFamily: OUTFIT,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            background: disabled ? BG : AMBER,
            color: disabled ? MUTED : TEXT,
            border: `1.5px solid ${disabled ? BORDER : AMBER}`,
            borderRadius: 7,
            padding: '9px 18px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flexShrink: 0,
          }}
        >
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  display: 'inline-block',
                  width: 5, height: 5,
                  borderRadius: '50%',
                  background: MUTED,
                  animation: 'dot-bounce 0.9s ease-in-out infinite',
                  animationDelay: `${i * 160}ms`,
                }} />
              ))}
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 5.5h8M6 2l3.5 3.5L6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t.inquiry.submit}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
