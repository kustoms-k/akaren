import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER = "'Geist', system-ui, sans-serif";

export function SetupAccount({ onSetupComplete }) {
  const { t } = useLanguage();
  const params   = new URLSearchParams(window.location.search);
  const token    = params.get('token') ?? '';

  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  if (!token) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={headStyle}>{t.setupAccount.invalidLink}</div>
          <p style={{ fontSize: 13, color: '#6a6050', margin: 0 }}>
            {t.setupAccount.invalidDesc}
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      return setError(t.setupAccount.errors.tooShort);
    }
    if (password !== password2) {
      return setError(t.setupAccount.errors.mismatch);
    }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t.setupAccount.errors.unknown);
      onSetupComplete(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{
          background: '#0d0d0f', borderRadius: '10px 10px 0 0',
          padding: '20px 28px', margin: '-28px -28px 24px',
        }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#c9921e', letterSpacing: '-0.01em' }}>
            {t.setupAccount.appName}
          </span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 6, letterSpacing: '-0.02em' }}>
          {t.setupAccount.heading}
        </div>
        <p style={{ fontSize: 13, color: '#6a6050', margin: '0 0 24px', lineHeight: 1.6 }}>
          {t.setupAccount.desc}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>{t.setupAccount.passwordLabel}</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.setupAccount.passwordHint}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>{t.setupAccount.confirmLabel}</span>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder={t.setupAccount.confirmHint}
              required
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{
              background: 'rgba(168,36,36,0.08)', border: '1px solid rgba(168,36,36,0.25)',
              borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#A82424',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password || !password2}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              background: (!password || !password2 || loading)
                ? 'rgba(28,25,23,0.06)' : '#1C1917',
              color: (!password || !password2 || loading) ? '#9A9088' : '#F4F0E8',
              border: 'none', borderRadius: 9, padding: '11px 0',
              cursor: (!password || !password2 || loading) ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
              marginTop: 4,
            }}
          >
            {loading ? t.setupAccount.activating : t.setupAccount.activate}
          </button>
        </form>
      </div>
    </div>
  );
}

const wrapStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#F5F3EF', padding: 20, fontFamily: INTER,
};
const cardStyle = {
  background: '#fff', border: '1px solid #E3DDD6', borderRadius: 12,
  padding: 28, width: '100%', maxWidth: 400,
  boxShadow: '0 2px 16px rgba(28,25,23,0.08)',
};
const headStyle = {
  fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 10,
};
const labelStyle = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#9A9088',
};
const inputStyle = {
  fontFamily: INTER, fontSize: 14, color: '#1C1917',
  background: '#F5F3EF', border: '1px solid #E3DDD6', borderRadius: 8,
  padding: '10px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};
