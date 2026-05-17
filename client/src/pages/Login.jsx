import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER = "'Inter', sans-serif";
const BLUE  = '#4361ee';
const TEXT  = '#1a1a2e';
const MUTED = '#6c757d';
const BG    = '#f0f2f5';
const WHITE = '#ffffff';
const BORDER = '#e9ecef';

function inputStyle(focused) {
  return {
    fontFamily: INTER, width: '100%', padding: '10px 14px',
    border: `1.5px solid ${focused ? BLUE : BORDER}`, borderRadius: 8,
    fontSize: 14, color: TEXT, background: WHITE, outline: 'none',
    boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(67,97,238,0.10)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: '#374151' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FocusInput({ type = 'text', value, onChange, placeholder, autoFocus }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      autoFocus={autoFocus}
      style={inputStyle(focused)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

export function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [tab, setTab] = useState('login');

  // Login state
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [loginError,    setLoginError]    = useState(false);
  const [loginLoading,  setLoginLoading]  = useState(false);

  // Register state
  const [regCompany,  setRegCompany]  = useState('');
  const [regOrgNr,    setRegOrgNr]    = useState('');
  const [regName,     setRegName]     = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regError,    setRegError]    = useState(null);
  const [regLoading,  setRegLoading]  = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setLoginLoading(true);
    setLoginError(false);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      login(data);
    } catch {
      setLoginError(true);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!regCompany.trim() || !regEmail.trim() || !regPassword) return;
    if (regPassword.length < 8) {
      setRegError(t.login.passwordMin);
      return;
    }
    setRegLoading(true);
    setRegError(null);
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: regCompany.trim(),
          org_nr:       regOrgNr.trim()  || null,
          user_name:    regName.trim()   || null,
          user_email:   regEmail.trim(),
          password:     regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      login(data);
    } catch (err) {
      setRegError(err.message || 'Registration failed');
    } finally {
      setRegLoading(false);
    }
  }

  const tabBtn = (id, lbl) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
        fontFamily: INTER, fontSize: 13, fontWeight: 600,
        background: tab === id ? WHITE : 'transparent',
        color: tab === id ? BLUE : MUTED,
        borderRadius: tab === id ? '6px 6px 0 0' : 0,
        borderBottom: tab === id ? `2px solid ${BLUE}` : `2px solid ${BORDER}`,
        transition: 'all 0.15s',
      }}
    >
      {lbl}
    </button>
  );

  return (
    <div style={{
      fontFamily: INTER, background: BG, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: WHITE, borderRadius: 12,
        boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
        padding: '40px', width: 420,
      }}>
        {/* Brand + language toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: BLUE, width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: WHITE, fontSize: 14, fontWeight: 700 }}>Å</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: 20, color: TEXT }}>{t.login.brand}</span>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {['en', 'sv'].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  fontFamily: INTER, fontSize: 11, fontWeight: 600,
                  background: lang === l ? BLUE : BG,
                  color: lang === l ? WHITE : MUTED,
                  border: `1px solid ${lang === l ? BLUE : BORDER}`,
                  borderRadius: 6, padding: '4px 10px',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 24 }}>
          {t.login.tagline}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', marginBottom: 24 }}>
          {tabBtn('login',    t.login.signIn)}
          {tabBtn('register', t.login.register)}
        </div>

        {/* ── Login form ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={t.login.email}>
              <FocusInput
                type="email" value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoFocus
              />
            </Field>

            <Field label={t.login.password}>
              <div style={{ position: 'relative' }}>
                <FocusInput
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                <button
                  type="button" tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: INTER, fontSize: 11, color: MUTED, padding: 0,
                  }}
                >
                  {showPassword ? t.login.hide : t.login.show}
                </button>
              </div>
            </Field>

            {loginError && (
              <div style={{
                background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 6,
                padding: '8px 12px', color: '#c53030', fontSize: 13,
              }}>
                {t.login.wrongCreds}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading || !loginEmail.trim() || !loginPassword}
              style={{
                fontFamily: INTER, width: '100%', fontWeight: 600, fontSize: 14,
                padding: 11, borderRadius: 8, border: 'none', marginTop: 8,
                background: (loginLoading || !loginEmail.trim() || !loginPassword) ? '#a0aec0' : BLUE,
                color: WHITE,
                cursor: (loginLoading || !loginEmail.trim() || !loginPassword) ? 'not-allowed' : 'pointer',
              }}
            >
              {loginLoading ? t.login.signingIn : t.login.signInBtn}
            </button>
          </form>
        )}

        {/* ── Register form ── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label={t.login.company}>
              <FocusInput
                value={regCompany}
                onChange={(e) => setRegCompany(e.target.value)}
                placeholder="Svensson Åkeri AB"
                autoFocus
              />
            </Field>

            <Field label={t.login.orgNr}>
              <FocusInput
                value={regOrgNr}
                onChange={(e) => setRegOrgNr(e.target.value)}
                placeholder="556789-0123"
              />
            </Field>

            <Field label={t.login.yourName}>
              <FocusInput
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Anna Svensson"
              />
            </Field>

            <Field label={t.login.workEmail}>
              <FocusInput
                type="email" value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="anna@svenssons.se"
              />
            </Field>

            <Field label={t.login.passwordMin}>
              <FocusInput
                type="password" value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </Field>

            {regError && (
              <div style={{
                background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 6,
                padding: '8px 12px', color: '#c53030', fontSize: 13,
              }}>
                {regError}
              </div>
            )}

            <button
              type="submit"
              disabled={regLoading || !regCompany.trim() || !regEmail.trim() || !regPassword}
              style={{
                fontFamily: INTER, width: '100%', fontWeight: 600, fontSize: 14,
                padding: 11, borderRadius: 8, border: 'none', marginTop: 4,
                background: (regLoading || !regCompany.trim() || !regEmail.trim() || !regPassword)
                  ? '#a0aec0' : BLUE,
                color: WHITE,
                cursor: (regLoading || !regCompany.trim() || !regEmail.trim() || !regPassword)
                  ? 'not-allowed' : 'pointer',
              }}
            >
              {regLoading ? t.login.creating : t.login.createBtn}
            </button>

            <p style={{ fontSize: 11, color: MUTED, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
              {t.login.setupNote}
            </p>
          </form>
        )}

        <div style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 20 }}>
          {t.login.pricing}
        </div>
      </div>
    </div>
  );
}
