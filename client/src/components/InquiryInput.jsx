import { useState } from 'react';
import { S } from '../constants/strings.js';

const INTER   = "'Inter', sans-serif";
const BLUE    = '#4361ee';
const WHITE   = '#ffffff';
const BORDER  = '#e9ecef';
const TEXT    = '#1a1a2e';
const MUTED   = '#6c757d';

export function InquiryInput({ onAnalyse, loading, apiError, isOnline = true }) {
  const [text, setText] = useState('');

  const empty    = !text.trim();
  const disabled = loading || empty || !isOnline;

  function handleSubmit(e) {
    e.preventDefault();
    if (!disabled) onAnalyse(text.trim());
  }

  const errorMsg =
    apiError === 'parse'   ? S.errors.parse   :
    apiError === 'network' ? S.errors.network  :
    null;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 0 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={S.inquiry.placeholder}
        disabled={loading}
        style={{
          fontFamily: INTER,
          fontSize: 14,
          lineHeight: '1.7',
          background: WHITE,
          color: TEXT,
          border: `1px solid ${BORDER}`,
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          height: '160px',
          padding: '14px 16px',
          resize: 'none',
          width: '100%',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
          opacity: loading ? 0.6 : 1,
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = BLUE;
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(67,97,238,0.10)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = BORDER;
          e.currentTarget.style.boxShadow = 'none';
        }}
      />

      <button
        type="submit"
        disabled={disabled}
        style={{
          fontFamily: INTER,
          fontSize: 13,
          fontWeight: 600,
          background: disabled ? '#a0aec0' : BLUE,
          color: WHITE,
          border: 'none',
          borderRadius: '0 0 8px 8px',
          padding: '12px 20px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
        }}
      >
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  width: 7, height: 7,
                  borderRadius: '50%',
                  background: WHITE,
                  animation: 'dot-bounce 0.9s ease-in-out infinite',
                  animationDelay: `${i * 160}ms`,
                }}
              />
            ))}
          </span>
        ) : S.inquiry.submit}
      </button>

      {!isOnline && (
        <div
          role="status"
          style={{
            marginTop: 8, padding: '10px 14px',
            background: '#fff0f0',
            border: '1px solid #fca5a5',
            borderRadius: 8, fontFamily: INTER, fontSize: 13,
            color: '#e74c3c', lineHeight: 1.5, flexShrink: 0,
          }}
        >
          AI kräver internetanslutning / AI requires connection
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          style={{
            marginTop: 8, padding: '10px 14px',
            background: '#fff7ed',
            border: '1px solid #fde68a',
            borderRadius: 8, fontFamily: INTER, fontSize: 13,
            color: '#d97706', lineHeight: 1.5, flexShrink: 0,
          }}
        >
          {errorMsg}
        </div>
      )}
    </form>
  );
}
