import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Button } from '../components/Button.jsx';

const INTER   = "'Geist', system-ui, sans-serif";
const ACCENT  = '#2d3340';
const BG      = '#f4f5f7';
const WHITE   = '#ffffff';
const BORDER  = '#ececef';
const TEXT    = '#1a1d24';
const MUTED   = '#6b7280';
const FAINT   = '#9ca3af';
const DANGER  = '#dc2626';

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
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
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
          background: ACCENT, borderRadius: '10px 10px 0 0',
          padding: '20px 28px', margin: '-28px -28px 24px',
        }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#ffffff', letterSpacing: '-0.01em' }}>
            {t.setupAccount.appName}
          </span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 6, letterSpacing: '-0.02em' }}>
          {t.setupAccount.heading}
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 24px', lineHeight: 1.6 }}>
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
              background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 7, padding: '8px 12px', fontSize: 12, color: DANGER,
            }}>
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={loading || !password || !password2}
            style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
          >
            {loading ? t.setupAccount.activating : t.setupAccount.activate}
          </Button>
        </form>
      </div>
    </div>
  );
}

const wrapStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: BG, padding: 20, fontFamily: INTER,
};
const cardStyle = {
  background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: 28, width: '100%', maxWidth: 400,
  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
};
const headStyle = {
  fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 10,
};
const labelStyle = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: FAINT,
};
const inputStyle = {
  fontFamily: INTER, fontSize: 14, color: TEXT,
  background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: '10px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};
