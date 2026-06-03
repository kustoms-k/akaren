import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER  = '#B56510';
const BG     = '#f4f5f7';
const WHITE  = '#ffffff';
const BORDER = '#ececef';
const TEXT   = '#1a1d24';
const MUTED  = '#6b7280';
const OUTFIT = "'Geist', system-ui, sans-serif";
const INTER  = OUTFIT;
const WHITE2 = '#ffffff';


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
          {t.inquiry.label}
        </span>
        <span style={{
          fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 10,
          color: nearLimit ? '#dc2626' : MUTED,
          letterSpacing: '0.04em',
          transition: 'color 0.2s',
        }}>
          {charCount.toLocaleString(lang === 'sv' ? 'sv-SE' : 'en-GB')}/{MAX_LEN.toLocaleString(lang === 'sv' ? 'sv-SE' : 'en-GB')}
        </span>
      </div>

      {/* Textarea */}
      <div style={{
        borderRadius: 8,
        border: `1.5px solid ${focused ? AMBER : BORDER}`,
        boxShadow: focused ? '0 0 0 3px rgba(181,101,16,0.11)' : 'none',
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
          <span style={{ fontFamily: OUTFIT, fontSize: 12, color: '#dc2626', flex: 1, lineHeight: 1.4 }}>
            {t.inquiry.offline}
          </span>
        )}
        {errorMsg && isOnline && (
          <span style={{ fontFamily: OUTFIT, fontSize: 12, color: '#dc2626', flex: 1, lineHeight: 1.4 }}>
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
            color: disabled ? MUTED : WHITE,
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
